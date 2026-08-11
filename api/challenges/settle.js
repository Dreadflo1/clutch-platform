/**
 * POST /api/challenges/settle
 * Body: { challengeId, result: 'win' | 'loss' }
 * Both players submit. If they agree, escrow releases. If conflict, dispute.
 */
import crypto from 'crypto';
import { requireAuth } from '../_auth.js';
import { kvGet, kvSet, kvLock, kvUnlock } from '../_kv.js';
import { settleEscrow, BalanceError } from '../_balance.js';

const PLATFORM_FEE = 0.025;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const user = requireAuth(req, res);
  if (!user) return;

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { challengeId, result } = body;

  if (!challengeId || !['win', 'loss'].includes(result)) {
    return res.status(400).json({ error: 'challengeId and result (win/loss) required' });
  }

  // Serialize the whole read-modify-write so two simultaneous submissions can
  // never both reach the payout branch (which would double-pay the winner).
  const lockKey = `lock:settle:${challengeId}`;
  const gotLock = await kvLock(lockKey, 10);
  if (!gotLock) return res.status(409).json({ error: 'Settlement in progress — retry shortly' });

  try {
    // Fetch challenge
    const ch = await kvGet(`ch:${challengeId}`);
    if (!ch) return res.status(404).json({ error: 'Challenge not found' });
    // 'active' = no result yet, 'awaiting_result' = one side already submitted.
    if (ch.status !== 'active' && ch.status !== 'awaiting_result') {
      return res.status(400).json({ error: `Challenge cannot be settled (status: ${ch.status})` });
    }

    // Determine role
    const isCreator = user.userId === ch.creatorUserId;
    const isOpponent = user.userId === ch.opponentUserId;
    if (!isCreator && !isOpponent) {
      return res.status(403).json({ error: 'You are not part of this challenge' });
    }

    // Record result
    if (isCreator) {
      if (ch.creatorResult) return res.status(400).json({ error: 'Already submitted' });
      ch.creatorResult = result;
    } else {
      if (ch.opponentResult) return res.status(400).json({ error: 'Already submitted' });
      ch.opponentResult = result;
    }

    // Check if both submitted
    if (ch.creatorResult && ch.opponentResult) {
      if (
        (ch.creatorResult === 'win' && ch.opponentResult === 'loss') ||
        (ch.creatorResult === 'loss' && ch.opponentResult === 'win')
      ) {
        // Agreement — settle
        const winnerId = ch.creatorResult === 'win' ? ch.creatorUserId : ch.opponentUserId;
        const loserId = ch.creatorResult === 'win' ? ch.opponentUserId : ch.creatorUserId;
        const payout = Math.floor(ch.stake * 2 * (1 - PLATFORM_FEE));

        // Atomically release both escrows and credit the winner.
        try {
          await settleEscrow(winnerId, loserId, ch.stake, payout);
        } catch (e) {
          if (e instanceof BalanceError) {
            return res.status(409).json({ error: `Cannot settle escrow (${e.code})` });
          }
          throw e;
        }

        // Log transactions
        const balWin = await kvGet(`bal:${winnerId}`);
        const balLose = await kvGet(`bal:${loserId}`);
        const txWin = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const txLose = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        await kvSet(`tx:${txWin}`, { id: txWin, userId: winnerId, type: 'win', amount: payout, ref: challengeId, ts: Date.now(), balAfter: balWin?.available }, 7776000);
        await kvSet(`tx:${txLose}`, { id: txLose, userId: loserId, type: 'loss', amount: -ch.stake, ref: challengeId, ts: Date.now(), balAfter: balLose?.available }, 7776000);

        // Update txlogs
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
      } else {
        // Conflict — dispute (no auto-resolution yet; see ROADMAP Phase 2)
        ch.status = 'disputed';
        ch.disputedAt = Date.now();
      }
    } else {
      ch.status = 'awaiting_result';
    }

    await kvSet(`ch:${challengeId}`, ch, 172800);

    return res.status(200).json({
      status: ch.status,
      challenge: {
        id: ch.id,
        status: ch.status,
        winner: ch.winner || null,
        payout: ch.payout || null,
        creatorResult: ch.creatorResult,
        opponentResult: ch.opponentResult,
      },
    });
  } finally {
    await kvUnlock(lockKey);
  }
}
