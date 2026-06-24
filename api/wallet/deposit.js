/**
 * POST /api/wallet/deposit
 * Body: { amount }
 * Adds CLU to available balance. Logs transaction.
 * In production: verify payment (Stripe, on-chain tx) before crediting.
 * Currently: demo mode — credits directly with a daily cap.
 */
import crypto from 'crypto';
import { requireAuth } from '../_auth.js';
import { kvGet, kvSet } from '../_kv.js';

const DAILY_DEPOSIT_CAP = 10000;
const MIN_DEPOSIT = 10;
const MAX_DEPOSIT = 5000;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const user = requireAuth(req, res);
  if (!user) return;

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const amount = parseInt(body.amount);

  if (isNaN(amount) || amount < MIN_DEPOSIT || amount > MAX_DEPOSIT) {
    return res.status(400).json({ error: `Amount must be ${MIN_DEPOSIT}-${MAX_DEPOSIT} CLU` });
  }

  // Read current balance
  const bal = await kvGet(`bal:${user.userId}`);
  if (!bal) return res.status(404).json({ error: 'Account not found' });

  // Daily cap check
  const todayKey = `deposits:${user.userId}:${new Date().toISOString().slice(0, 10)}`;
  const todayTotal = (await kvGet(todayKey)) || 0;
  if (todayTotal + amount > DAILY_DEPOSIT_CAP) {
    return res.status(400).json({ error: `Daily deposit cap: ${DAILY_DEPOSIT_CAP} CLU. Already deposited: ${todayTotal}` });
  }

  // Credit balance
  bal.available += amount;
  bal.version++;
  await kvSet(`bal:${user.userId}`, bal);

  // Update daily tracker
  await kvSet(todayKey, todayTotal + amount, 86400);

  // Log transaction
  const txId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const tx = {
    id: txId,
    userId: user.userId,
    type: 'deposit',
    amount,
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
