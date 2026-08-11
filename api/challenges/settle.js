/**
 * POST /api/challenges/settle
 *
 * Two ways to settle, both idempotent under the per-challenge lock:
 *
 *  1. Auto-verified (preferred, trustless — LoL / Dota 2):
 *     Body: { challengeId, matchId, handle, region? }
 *     Each player submits the match id + their game handle. When both have
 *     submitted, the server confirms they reference the SAME match, pulls the
 *     real result from the game API, and pays the actually-winning side. No one
 *     is trusted to self-report.
 *
 *  2. Result-based (honor system, fallback for non-verifiable games):
 *     Body: { challengeId, result: 'win' | 'loss' }
 *     Both submit; agreement settles, conflict disputes.
 */
import { requireAuth } from '../_auth.js';
import { kvGet, kvLock, kvUnlock } from '../_kv.js';
import { BalanceError } from '../_balance.js';
import { isVerifiable, resolveOutcome } from '../_verify.js';
import { persist, saveChallenge, settleToWinner, refundDraw } from '../_challenges.js';

// The verifying match must have STARTED after acceptance (small negative slack
// only for clock skew), so a player cannot point at a game they pre-played and
// already won before committing to the challenge.
const MATCH_RECENCY_SLACK_MS = 5 * 60 * 1000; // 5 min clock-skew tolerance

function challengeView(ch) {
  return {
    id: ch.id,
    status: ch.status,
    winner: ch.winner || null,
    payout: ch.payout || null,
    creatorResult: ch.creatorResult || null,
    opponentResult: ch.opponentResult || null,
    verified: Boolean(ch.verified),
  };
}

/**
 * Pure verdict from two verified match outcomes (no I/O — unit-testable).
 * @returns {{action:'dispute',reason:string} | {action:'settle',winnerId,loserId,matchId}}
 */
function evaluateVerification(ch, cRes, oRes) {
  const minTs = (ch.acceptedAt || 0) - MATCH_RECENCY_SLACK_MS;
  if (cRes.timestamp < minTs || oRes.timestamp < minTs) return { action: 'dispute', reason: 'stale_match' };
  if (cRes.win === oRes.win) return { action: 'dispute', reason: 'inconsistent_outcome' };
  const winnerId = cRes.win ? ch.creatorUserId : ch.opponentUserId;
  const loserId = cRes.win ? ch.opponentUserId : ch.creatorUserId;
  return { action: 'settle', winnerId, loserId, matchId: cRes.matchId };
}

const TERMINAL = new Set(['settled', 'refunded', 'cancelled', 'disputed']);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const user = requireAuth(req, res);
  if (!user) return;

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { challengeId, result, matchId, handle, region } = body;

  if (!challengeId) return res.status(400).json({ error: 'challengeId required' });

  const verifiedMode = Boolean(matchId);
  if (!verifiedMode && !['win', 'loss'].includes(result)) {
    return res.status(400).json({ error: 'Provide either { matchId, handle } (auto-verify) or { result: win|loss }' });
  }

  // Per-challenge lock. Held only for read-modify-write of state — NEVER across
  // the game-API calls, which are done unlocked between two short locked phases.
  const lockKey = `lock:settle:${challengeId}`;
  let holding = await kvLock(lockKey, 15);
  if (!holding) return res.status(409).json({ error: 'Settlement in progress — retry shortly' });
  const release = async () => { if (holding) { holding = false; await kvUnlock(lockKey); } };

  try {
    let ch = await kvGet(`ch:${challengeId}`);
    if (!ch) return res.status(404).json({ error: 'Challenge not found' });
    if (ch.status !== 'active' && ch.status !== 'awaiting_result') {
      return res.status(400).json({ error: `Challenge cannot be settled (status: ${ch.status})` });
    }

    const isCreator = user.userId === ch.creatorUserId;
    const isOpponent = user.userId === ch.opponentUserId;
    if (!isCreator && !isOpponent) {
      return res.status(403).json({ error: 'You are not part of this challenge' });
    }

    // Past the settlement deadline → unwind as a draw (both stakes refunded)
    // rather than let a no-show / stalling player trap the escrow forever.
    if (ch.settleDeadline && Date.now() > ch.settleDeadline) {
      await refundDraw(ch, 'timeout');
      return res.status(200).json({
        status: ch.status,
        reason: 'timeout',
        warning: 'No-show: match not settled by the deadline. Refunded minus the platform commission.',
        challenge: challengeView(ch),
      });
    }

    // ── Auto-verified path ──────────────────────────────────────
    if (verifiedMode) {
      if (!isVerifiable(ch.game)) {
        return res.status(400).json({ error: `Auto-verification not supported for ${ch.game} — settle with result win/loss instead` });
      }
      if (!handle) return res.status(400).json({ error: 'handle required for auto-verification' });

      const submission = { matchId: String(matchId), handle: String(handle), region: region || null };
      // Record the submission. A resubmission with the SAME match id is allowed
      // (it re-triggers finalization after a transient verify failure); changing
      // your answer is not.
      if (isCreator) {
        if (ch.creatorVerify && ch.creatorVerify.matchId !== submission.matchId) {
          return res.status(400).json({ error: 'Already submitted a different match id' });
        }
        if (!ch.creatorVerify) ch.creatorVerify = submission;
      } else {
        if (ch.opponentVerify && ch.opponentVerify.matchId !== submission.matchId) {
          return res.status(400).json({ error: 'Already submitted a different match id' });
        }
        if (!ch.opponentVerify) ch.opponentVerify = submission;
      }

      const bothPresent = ch.creatorVerify && ch.opponentVerify;
      if (!bothPresent) {
        ch.status = 'awaiting_result';
        await persist(ch);
        return res.status(200).json({ status: ch.status, challenge: challengeView(ch) });
      }

      // Cheap consensus check (no network) — settle-in-lock is fine here.
      if (ch.creatorVerify.matchId !== ch.opponentVerify.matchId) {
        ch.status = 'disputed';
        ch.disputeReason = 'match_id_mismatch';
        ch.disputedAt = Date.now();
        await saveChallenge(ch);
        return res.status(200).json({ status: ch.status, reason: ch.disputeReason, challenge: challengeView(ch) });
      }

      // Persist submissions, then DROP the lock for the game-API round-trip so a
      // slow/rate-limited API can never make the lock expire mid-settlement.
      await persist(ch);
      const creatorVerify = ch.creatorVerify;
      const opponentVerify = ch.opponentVerify;
      await release();

      const [cRes, oRes] = await Promise.all([
        resolveOutcome({ game: ch.game, region: creatorVerify.region, matchId: creatorVerify.matchId, handle: creatorVerify.handle }),
        resolveOutcome({ game: ch.game, region: opponentVerify.region, matchId: opponentVerify.matchId, handle: opponentVerify.handle }),
      ]);
      if (!cRes.ok || !oRes.ok) {
        // Keep submissions persisted so either player can retry once the
        // API/handle issue clears.
        return res.status(502).json({
          error: 'Match verification failed',
          creator: cRes.ok ? 'ok' : cRes.error,
          opponent: oRes.ok ? 'ok' : oRes.error,
        });
      }
      const verdict = evaluateVerification(ch, cRes, oRes);

      // Re-acquire the lock to apply the verdict atomically.
      holding = await kvLock(lockKey, 15);
      if (!holding) return res.status(409).json({ error: 'Settlement in progress — retry shortly' });
      ch = await kvGet(`ch:${challengeId}`);
      if (!ch) return res.status(404).json({ error: 'Challenge not found' });
      if (TERMINAL.has(ch.status)) {
        // Already finalized (concurrent call, prior retry, or timeout refund).
        return res.status(200).json({ status: ch.status, reason: ch.disputeReason || undefined, challenge: challengeView(ch) });
      }

      if (verdict.action === 'dispute') {
        ch.status = 'disputed';
        ch.disputeReason = verdict.reason;
        ch.disputedAt = Date.now();
        await saveChallenge(ch);
        return res.status(200).json({ status: ch.status, reason: verdict.reason, challenge: challengeView(ch) });
      }

      ch.verified = true;
      ch.verifiedMatchId = verdict.matchId;
      try {
        await settleToWinner(ch, verdict.winnerId, verdict.loserId);
      } catch (e) {
        if (e instanceof BalanceError) return res.status(409).json({ error: `Cannot settle escrow (${e.code})` });
        throw e;
      }
      await saveChallenge(ch);
      return res.status(200).json({ status: ch.status, challenge: challengeView(ch) });
    }

    // ── Result-based (honor system) path — no network, stays in lock ──
    if (isCreator) {
      if (ch.creatorResult) return res.status(400).json({ error: 'Already submitted' });
      ch.creatorResult = result;
    } else {
      if (ch.opponentResult) return res.status(400).json({ error: 'Already submitted' });
      ch.opponentResult = result;
    }

    if (ch.creatorResult && ch.opponentResult) {
      if (
        (ch.creatorResult === 'win' && ch.opponentResult === 'loss') ||
        (ch.creatorResult === 'loss' && ch.opponentResult === 'win')
      ) {
        const winnerId = ch.creatorResult === 'win' ? ch.creatorUserId : ch.opponentUserId;
        const loserId = ch.creatorResult === 'win' ? ch.opponentUserId : ch.creatorUserId;
        try {
          await settleToWinner(ch, winnerId, loserId);
        } catch (e) {
          if (e instanceof BalanceError) return res.status(409).json({ error: `Cannot settle escrow (${e.code})` });
          throw e;
        }
      } else {
        ch.status = 'disputed';
        ch.disputeReason = 'result_conflict';
        ch.disputedAt = Date.now();
      }
    } else {
      ch.status = 'awaiting_result';
    }

    await saveChallenge(ch);
    return res.status(200).json({ status: ch.status, challenge: challengeView(ch) });
  } finally {
    await release();
  }
}
