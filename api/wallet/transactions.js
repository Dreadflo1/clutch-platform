/**
 * GET /api/wallet/transactions?limit=50
 * Returns recent transaction history
 */
import { requireAuth } from '../_auth.js';
import { kvGet } from '../_kv.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const txlog = (await kvGet(`txlog:${user.userId}`)) || [];
  const txIds = txlog.slice(0, limit);

  const txs = await Promise.all(
    txIds.map(id => kvGet(`tx:${id}`))
  );

  return res.status(200).json({
    transactions: txs.filter(Boolean),
    count: txs.filter(Boolean).length,
  });
}
