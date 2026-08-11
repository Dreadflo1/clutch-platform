/**
 * /api/wallet/deposits-reconcile   (admin only)
 *
 * GET  → list deposits stuck in 'crediting' (claimed but the ledger credit
 *        failed — a crash between claim and credit).
 * POST { payKey, action: 'credit' | 'abandon' } → resolve one.
 *
 * Human-gated on purpose: a stuck record means we can't be sure the balance
 * mutation landed, so a person decides rather than auto-retrying (which could
 * double-credit). Gated by ADMIN_SECRET; refuses in prod if unset.
 */
import { kvGet } from '../_kv.js';
import { getReconcileList, resolveReconcile } from '../_payments.js';

const IS_PROD =
  process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

function authorize(req, res) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    if (IS_PROD) { res.status(503).json({ error: 'Reconcile not configured (ADMIN_SECRET unset)' }); return false; }
    return true;
  }
  if (req.headers.authorization !== `Bearer ${secret}`) { res.status(401).json({ error: 'Unauthorized' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!authorize(req, res)) return;

  if (req.method === 'GET') {
    const keys = await getReconcileList();
    const items = await Promise.all(keys.map(async k => ({ payKey: k, record: await kvGet(k) })));
    return res.status(200).json({ count: items.length, items });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { payKey, action } = body;
    if (!payKey || !['credit', 'abandon'].includes(action)) {
      return res.status(400).json({ error: "payKey and action ('credit'|'abandon') required" });
    }
    const outcome = await resolveReconcile(payKey, action);
    if (outcome === 'not_found') return res.status(404).json({ error: 'Reconcile record not found' });
    return res.status(200).json({ payKey, outcome });
  }

  return res.status(405).json({ error: 'GET or POST only' });
}
