/**
 * POST /api/challenges/resolve  (admin only)
 * Body: { challengeId, resolution: 'creator' | 'opponent' | 'draw', note? }
 *
 * Manually resolves a DISPUTED challenge — the human backstop for the win/win
 * conflicts that verification cannot arbitrate. Awards the pot to one side or
 * splits it as a draw. Either way the platform commission is still levied (a
 * dispute is never a way to dodge the fee). Gated by ADMIN_SECRET (Bearer);
 * money-moving, so in production it refuses to run unless the secret matches.
 */
import { kvGet, kvLock, kvUnlock } from '../_kv.js';
import { BalanceError } from '../_balance.js';
import { saveChallenge, settleToWinner, refundDraw } from '../_challenges.js';

const IS_PROD =
  process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

function authorize(req, res) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    if (IS_PROD) {
      res.status(503).json({ error: 'Admin resolution not configured (ADMIN_SECRET unset)' });
      return false;
    }
    return true; // dev convenience
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!authorize(req, res)) return;

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { challengeId, resolution, note } = body;

  if (!challengeId || !['creator', 'opponent', 'draw'].includes(resolution)) {
    return res.status(400).json({ error: "challengeId and resolution ('creator'|'opponent'|'draw') required" });
  }

  const lockKey = `lock:settle:${challengeId}`;
  if (!(await kvLock(lockKey, 15))) {
    return res.status(409).json({ error: 'Challenge is busy — retry shortly' });
  }

  try {
    const ch = await kvGet(`ch:${challengeId}`);
    if (!ch) return res.status(404).json({ error: 'Challenge not found' });
    if (ch.status !== 'disputed') {
      return res.status(400).json({ error: `Only disputed challenges can be resolved (status: ${ch.status})` });
    }

    ch.resolvedBy = 'admin';
    ch.resolvedAt = Date.now();
    if (typeof note === 'string') ch.adminNote = note.slice(0, 500);

    try {
      if (resolution === 'draw') {
        await refundDraw(ch, 'admin_draw'); // self-persists + archives
      } else {
        const winnerId = resolution === 'creator' ? ch.creatorUserId : ch.opponentUserId;
        const loserId = resolution === 'creator' ? ch.opponentUserId : ch.creatorUserId;
        await settleToWinner(ch, winnerId, loserId);
        ch.resolution = resolution;
        await saveChallenge(ch);
      }
    } catch (e) {
      if (e instanceof BalanceError) {
        return res.status(409).json({ error: `Cannot resolve — escrow already released (${e.code})` });
      }
      throw e;
    }

    return res.status(200).json({
      status: ch.status,
      resolution,
      challenge: { id: ch.id, status: ch.status, winner: ch.winner || null, payout: ch.payout || null },
    });
  } finally {
    await kvUnlock(lockKey);
  }
}
