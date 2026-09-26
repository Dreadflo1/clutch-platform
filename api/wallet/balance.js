/**
 * GET /api/wallet/balance
 * Returns server-side balance — the source of truth
 */
import { requireAuth } from '../_auth.js';
import { kvGet } from '../_kv.js';
import { integrityOf } from '../_integrity.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const [bal, integrity] = await Promise.all([
    kvGet(`bal:${user.userId}`),
    integrityOf(user.userId),
  ]);
  if (!bal) {
    return res.status(200).json({ available: 0, escrow: 0, integrity });
  }

  return res.status(200).json({
    available: bal.available,
    escrow: bal.escrow,
    integrity, // { disputes, threshold, banned }
  });
}
