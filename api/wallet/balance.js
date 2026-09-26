/**
 * GET /api/wallet/balance
 * Returns server-side balance — the source of truth
 */
import { requireAuth } from '../_auth.js';
import { kvGet } from '../_kv.js';
import { integrityOf } from '../_integrity.js';
import { withdrawableCap } from '../_payments.js';
import { ageStatus } from '../_age.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const [bal, integrity, withdrawable, age] = await Promise.all([
    kvGet(`bal:${user.userId}`),
    integrityOf(user.userId),
    withdrawableCap(user.userId),
    ageStatus(user.userId),
  ]);
  if (!bal) {
    return res.status(200).json({ available: 0, escrow: 0, withdrawable, integrity, age });
  }

  return res.status(200).json({
    available: bal.available,
    escrow: bal.escrow,
    withdrawable, // how much of `available` is cashable (= net deposited)
    integrity, // { disputes, threshold, banned }
    age,        // { confirmed (16+), adult (18+) }
  });
}
