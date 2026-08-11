/**
 * POST /api/wallet/withdraw
 * Body: { amount (CLU), rail: 'onchain' | 'stripe', destination? }
 *
 * Debits the user's CLU atomically (no overdraft, no race) and enqueues a
 * PENDING payout for the chosen rail. The actual outbound transfer (an on-chain
 * send or a Stripe payout) is executed by a controlled fulfilment step, never
 * inline here — so funds leave the ledger exactly once and are queued for payout.
 */
import { requireAuth } from '../_auth.js';
import { kvGet, kvSet } from '../_kv.js';
import { createPayoutRequest, BalanceError } from '../_payments.js';

const DAILY_WITHDRAW_CAP = 10000;
const MIN_WITHDRAW = 10;
const MAX_WITHDRAW = 5000;
const RAILS = ['crypto', 'stripe'];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const user = requireAuth(req, res);
  if (!user) return;

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const amount = parseInt(body.amount);
  const rail = body.rail;

  if (isNaN(amount) || amount < MIN_WITHDRAW || amount > MAX_WITHDRAW) {
    return res.status(400).json({ error: `Amount must be ${MIN_WITHDRAW}-${MAX_WITHDRAW} CLU` });
  }
  if (!RAILS.includes(rail)) {
    return res.status(400).json({ error: `rail must be one of: ${RAILS.join(', ')}` });
  }

  // Resolve destination per rail.
  let destination = null;
  let payoutMeta = {};
  if (rail === 'crypto') {
    destination = (body.destination || '').trim();
    const currency = (body.currency || '').trim().toLowerCase();
    if (destination.length < 12 || destination.length > 128) {
      return res.status(400).json({ error: 'A valid destination crypto address is required' });
    }
    if (!/^[a-z0-9]{2,20}$/.test(currency)) {
      return res.status(400).json({ error: 'A payout currency is required (e.g. usdttrc20, usdcmatic)' });
    }
    payoutMeta = { currency };
  }
  // For 'stripe', the payout target is resolved from the user's Stripe account
  // at fulfilment time; no destination needed here.

  // Daily cap (advisory — small races here are not fund-critical).
  const todayKey = `withdrawals:${user.userId}:${new Date().toISOString().slice(0, 10)}`;
  const todayTotal = (await kvGet(todayKey)) || 0;
  if (todayTotal + amount > DAILY_WITHDRAW_CAP) {
    return res.status(400).json({ error: `Daily withdrawal cap: ${DAILY_WITHDRAW_CAP} CLU. Already: ${todayTotal}` });
  }

  let result;
  try {
    result = await createPayoutRequest({ userId: user.userId, clu: amount, rail, destination, meta: payoutMeta });
  } catch (e) {
    if (e instanceof BalanceError) {
      if (e.code === 'NO_ACCOUNT') return res.status(404).json({ error: 'Account not found' });
      if (e.code === 'INSUFFICIENT_AVAILABLE') return res.status(400).json({ error: 'Insufficient available balance' });
    }
    throw e;
  }

  await kvSet(todayKey, todayTotal + amount, 86400);

  return res.status(202).json({
    status: 'pending',
    payoutId: result.payoutId,
    debited: amount,
    available: result.available,
    rail,
    message: 'Withdrawal requested — payout is queued for processing',
  });
}
