/**
 * /api/wallet/payouts-admin   (admin/ops only)
 *
 * GET  → list pending payout requests (the withdrawal queue).
 * POST { payoutId, action: 'sent' | 'failed', ref?, reason? }
 *        - 'sent'   → mark fulfilled (ops has sent the crypto via NOWPayments /
 *                     the fiat via Stripe); `ref` records the external tx/batch id.
 *        - 'failed' → refund the debited CLU back to the user (idempotent).
 *
 * V1 off-ramp is ops-fulfilled on purpose: no hot-wallet key or account
 * password lives on the server, and withdrawals get a manual anti-fraud/AML
 * pass. Gated by ADMIN_SECRET; refuses in prod if unset.
 */
import { kvGet, kvLock, kvUnlock } from '../_kv.js';
import {
  getPendingPayoutIds, getPayout, markPayoutSent, failPayoutAndRefund,
} from '../_payments.js';

const IS_PROD =
  process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

function authorize(req, res) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    if (IS_PROD) { res.status(503).json({ error: 'Payouts admin not configured (ADMIN_SECRET unset)' }); return false; }
    return true;
  }
  if (req.headers.authorization !== `Bearer ${secret}`) { res.status(401).json({ error: 'Unauthorized' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!authorize(req, res)) return;

  if (req.method === 'GET') {
    const ids = await getPendingPayoutIds(200);
    const items = await Promise.all(ids.map(id => getPayout(id)));
    return res.status(200).json({ count: items.length, payouts: items.filter(Boolean) });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { payoutId, action, ref, reason } = body;
    if (!payoutId || !['sent', 'failed'].includes(action)) {
      return res.status(400).json({ error: "payoutId and action ('sent'|'failed') required" });
    }

    const lockKey = `lock:payout:${payoutId}`;
    if (!(await kvLock(lockKey, 15))) return res.status(409).json({ error: 'Payout is busy — retry shortly' });
    try {
      const payout = await getPayout(payoutId);
      if (!payout) return res.status(404).json({ error: 'Payout not found' });
      if (payout.status !== 'pending' && payout.status !== 'processing') {
        return res.status(409).json({ error: `Payout already ${payout.status}` });
      }
      if (action === 'sent') {
        await markPayoutSent(payout, ref || null);
        return res.status(200).json({ payoutId, status: 'sent', ref: ref || null });
      }
      await failPayoutAndRefund(payout, reason || 'ops_rejected');
      return res.status(200).json({ payoutId, status: 'failed', refunded: payout.clu });
    } finally {
      await kvUnlock(lockKey);
    }
  }

  return res.status(405).json({ error: 'GET or POST only' });
}
