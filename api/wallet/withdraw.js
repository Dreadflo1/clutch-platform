/**
 * POST /api/wallet/withdraw
 * Body: { amount }
 * Debits CLU from available balance and logs the withdrawal.
 *
 * In production: this must trigger a real off-ramp payout (on-chain transfer or
 * fiat) AFTER the debit succeeds. Currently demo mode — it only debits the
 * internal balance so the escrow/ledger flow can be exercised end to end.
 */
import crypto from 'crypto';
import { requireAuth } from '../_auth.js';
import { kvGet, kvSet } from '../_kv.js';
import { mutateBalance, BalanceError } from '../_balance.js';

const DAILY_WITHDRAW_CAP = 10000;
const MIN_WITHDRAW = 10;
const MAX_WITHDRAW = 5000;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const user = requireAuth(req, res);
  if (!user) return;

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const amount = parseInt(body.amount);

  if (isNaN(amount) || amount < MIN_WITHDRAW || amount > MAX_WITHDRAW) {
    return res.status(400).json({ error: `Amount must be ${MIN_WITHDRAW}-${MAX_WITHDRAW} CLU` });
  }

  // Daily cap check
  const todayKey = `withdrawals:${user.userId}:${new Date().toISOString().slice(0, 10)}`;
  const todayTotal = (await kvGet(todayKey)) || 0;
  if (todayTotal + amount > DAILY_WITHDRAW_CAP) {
    return res.status(400).json({ error: `Daily withdrawal cap: ${DAILY_WITHDRAW_CAP} CLU. Already withdrawn: ${todayTotal}` });
  }

  // Debit balance atomically — fails if available < amount (no overdraft, no race)
  let bal;
  try {
    bal = await mutateBalance(user.userId, { dAvailable: -amount, minAvailable: amount });
  } catch (e) {
    if (e instanceof BalanceError) {
      if (e.code === 'NO_ACCOUNT') return res.status(404).json({ error: 'Account not found' });
      if (e.code === 'INSUFFICIENT_AVAILABLE') {
        return res.status(400).json({ error: 'Insufficient available balance' });
      }
    }
    throw e;
  }

  // Update daily tracker
  await kvSet(todayKey, todayTotal + amount, 86400);

  // Log transaction
  const txId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const tx = {
    id: txId,
    userId: user.userId,
    type: 'withdraw',
    amount: -amount,
    balAfter: bal.available,
    ts: Date.now(),
  };
  await kvSet(`tx:${txId}`, tx, 7776000); // 90 days

  const txlog = (await kvGet(`txlog:${user.userId}`)) || [];
  txlog.unshift(txId);
  await kvSet(`txlog:${user.userId}`, txlog.slice(0, 200));

  return res.status(200).json({
    available: bal.available,
    escrow: bal.escrow,
    transaction: tx,
  });
}
