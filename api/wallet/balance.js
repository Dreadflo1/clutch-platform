/**
 * GET /api/wallet/balance
 * Returns server-side balance — the source of truth
 */
import { requireAuth } from '../_auth.js';
import { kvGet } from '../_kv.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const bal = await kvGet(`bal:${user.userId}`);
  if (!bal) {
    return res.status(200).json({ available: 0, escrow: 0 });
  }

  return res.status(200).json({
    available: bal.available,
    escrow: bal.escrow,
  });
}
