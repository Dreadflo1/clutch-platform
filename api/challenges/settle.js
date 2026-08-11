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
import crypto from 'crypto';
import { requireAuth } from '../_auth.js';
import { kvGet, kvSet, kvLock, kvUnlock } from '../_kv.js';
import { settleEscrow, BalanceError } from '../_balance.js';
import { isVerifiable, resolveOutcome } from '../_verify.js';

const PLATFORM_FEE = 0.025;
// A verifying match must be recent relative to acceptance, so a player cannot
// point at some old game they happened to win.
const MATCH_RECENCY_SLACK_MS = 6 * 60 * 60 * 1000; // 6h before acceptedAt

/**
 * Release both escrows, credit the winner, log transactions, and stamp the
 * challenge as settled. Throws BalanceError if escrow is not as expected.
 */
async function finalizeSettlement(ch, challengeId, winnerId, loserId) {
  const payout = Math.floor(ch.stake * 2 * (1 - PLATFORM_FEE));
  await settleEscrow(winnerId, loserId, ch.stake, payout);

  const balWin = await kvGet(`bal:${winnerId}`);
  const balLose = await kvGet(`bal:${loserId}`);
  const txWin = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const txLose = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  await kvSet(`tx:${txWin}`, { id: txWin, userId: winnerId, type: 'win', amount: payout, ref: challengeId, ts: Date.now(), balAfter: balWin?.available }, 7776000);
  await kvSet(`tx:${txLose}`, { id: txLose, userId: loserId, type: 'loss', amount: -ch.stake, ref: challengeId, ts: Date.now(), balAfter: balLose?.available }, 7776000);

  const winLog = (await kvGet(`txlog:${winnerId}`)) || [];
  winLog.unshift(txWin);
  await kvSet(`txlog:${winnerId}`, winLog.slice(0, 200));
  const loseLog = (await kvGet(`txlog:${loserId}`)) || [];
  loseLog.unshift(txLose);
  await kvSet(`txlog:${loserId}`, loseLog.slice(0, 200));

  ch.status = 'settled';
  ch.winner = winnerId;
  ch.payout = payout;
  ch.settledAt = Date.now();
}

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

  // Serialize the whole read-modify-write so two simultaneous submissions can
  // never both reach the payout branch (which would double-pay the winner).
  const lockKey = `lock:settle:${challengeId}`;
  const gotLock = await kvLock(lockKey, 15);
  if (!gotLock) return res.status(409).json({ error: 'Settlement in progress — retry shortly' });

  try {
    const ch = await kvGet(`ch:${challengeId}`);
    if (!ch) return res.status(404).json({ error: 'Challenge not found' });
    if (ch.status !== 'active' && ch.status !== 'awaiting_result') {
      return res.status(400).json({ error: `Challenge cannot be settled (status: ${ch.status})` });
    }

    const isCreator = user.userId === ch.creatorUserId;
    const isOpponent = user.userId === ch.opponentUserId;
    if (!isCreator && !isOpponent) {
      return res.status(403).json({ error: 'You are not part of this challenge' });
    }

    // ── Auto-verified path ──────────────────────────────────────
    if (verifiedMode) {
      if (!isVerifiable(ch.game)) {
        return res.status(400).json({ error: `Auto-verification not supported for ${ch.game} — settle with result win/loss instead` });
      }
      if (!handle) return res.status(400).json({ error: 'handle required for auto-verification' });

      const submission = { matchId: String(matchId), handle: String(handle), region: region || null };
      if (isCreator) {
        if (ch.creatorVerify) return res.status(400).json({ error: 'Already submitted' });
        ch.creatorVerify = submission;
      } else {
        if (ch.opponentVerify) return res.status(400).json({ error: 'Already submitted' });
        ch.opponentVerify = submission;
      }

      if (ch.creatorVerify && ch.opponentVerify) {
        // Both players must reference the same match.
        if (ch.creatorVerify.matchId !== ch.opponentVerify.matchId) {
          ch.status = 'disputed';
          ch.disputeReason = 'match_id_mismatch';
          ch.disputedAt = Date.now();
          await kvSet(`ch:${challengeId}`, ch, 172800);
          return res.status(200).json({ status: ch.status, reason: ch.disputeReason, challenge: challengeView(ch) });
        }

        // Pull the real result for each player from the game API.
        const [cRes, oRes] = await Promise.all([
          resolveOutcome({ game: ch.game, region: ch.creatorVerify.region, matchId: ch.creatorVerify.matchId, handle: ch.creatorVerify.handle }),
          resolveOutcome({ game: ch.game, region: ch.opponentVerify.region, matchId: ch.opponentVerify.matchId, handle: ch.opponentVerify.handle }),
        ]);

        if (!cRes.ok || !oRes.ok) {
          // Do NOT finalize on a lookup failure — keep submissions so a retry
          // works once the API/handle issue clears.
          return res.status(502).json({
            error: 'Match verification failed',
            creator: cRes.ok ? 'ok' : cRes.error,
            opponent: oRes.ok ? 'ok' : oRes.error,
          });
        }

        // Match must be recent relative to when the challenge was accepted.
        const minTs = (ch.acceptedAt || 0) - MATCH_RECENCY_SLACK_MS;
        if (cRes.timestamp < minTs || oRes.timestamp < minTs) {
          ch.status = 'disputed';
          ch.disputeReason = 'stale_match';
          ch.disputedAt = Date.now();
          await kvSet(`ch:${challengeId}`, ch, 172800);
          return res.status(200).json({ status: ch.status, reason: ch.disputeReason, challenge: challengeView(ch) });
        }

        // In a 1v1 exactly one side must have won.
        if (cRes.win === oRes.win) {
          ch.status = 'disputed';
          ch.disputeReason = 'inconsistent_outcome';
          ch.disputedAt = Date.now();
          await kvSet(`ch:${challengeId}`, ch, 172800);
          return res.status(200).json({ status: ch.status, reason: ch.disputeReason, challenge: challengeView(ch) });
        }

        const winnerId = cRes.win ? ch.creatorUserId : ch.opponentUserId;
        const loserId = cRes.win ? ch.opponentUserId : ch.creatorUserId;
        ch.verified = true;
        ch.verifiedMatchId = cRes.matchId;
        try {
          await finalizeSettlement(ch, challengeId, winnerId, loserId);
        } catch (e) {
          if (e instanceof BalanceError) return res.status(409).json({ error: `Cannot settle escrow (${e.code})` });
          throw e;
        }
      } else {
        ch.status = 'awaiting_result';
      }

      await kvSet(`ch:${challengeId}`, ch, 172800);
      return res.status(200).json({ status: ch.status, challenge: challengeView(ch) });
    }

    // ── Result-based (honor system) path ────────────────────────
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
          await finalizeSettlement(ch, challengeId, winnerId, loserId);
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

    await kvSet(`ch:${challengeId}`, ch, 172800);
    return res.status(200).json({ status: ch.status, challenge: challengeView(ch) });
  } finally {
    await kvUnlock(lockKey);
  }
}
