/**
 * GET /api/challenges/admin   (admin only)
 *
 * Platform overview for the admin back-office — the data behind managing
 * challenges: the disputes queue (what resolve.js needs to act on), the live
 * active challenges, and headline counts. Gated by ADMIN_SECRET; refuses in prod
 * if unset. Read-only (mutations go through resolve / payouts-admin / reconcile).
 *
 * Query: ?status=disputed|active|awaiting_result|all (default: all)
 */
import { kvGet } from '../_kv.js';
import { getActiveList, getOpenList } from '../_challenges.js';

const IS_PROD =
  process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

function authorize(req, res) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    if (IS_PROD) { res.status(503).json({ error: 'Admin overview not configured (ADMIN_SECRET unset)' }); return false; }
    return true;
  }
  if (req.headers.authorization !== `Bearer ${secret}`) { res.status(401).json({ error: 'Unauthorized' }); return false; }
  return true;
}

function view(ch) {
  return {
    id: ch.id, game: ch.game, mode: ch.mode, stake: ch.stake, status: ch.status,
    creatorUserId: ch.creatorUserId, opponentUserId: ch.opponentUserId,
    disputeReason: ch.disputeReason || null,
    creatorResult: ch.creatorResult || null, opponentResult: ch.opponentResult || null,
    createdAt: ch.createdAt, acceptedAt: ch.acceptedAt || null,
    settleDeadline: ch.settleDeadline || null, disputedAt: ch.disputedAt || null,
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!authorize(req, res)) return;

  // Active list holds every accepted-but-unsettled challenge (incl. disputed).
  const activeIds = await getActiveList();
  const active = (await Promise.all(activeIds.map(id => kvGet(`ch:${id}`)))).filter(Boolean);
  const openCount = (await getOpenList()).filter(c => c.status === 'open').length;

  const disputed = active.filter(c => c.status === 'disputed');
  const now = Date.now();
  const stats = {
    open: openCount,
    active: active.filter(c => c.status === 'active' || c.status === 'awaiting_result').length,
    disputed: disputed.length,
    pastDeadline: active.filter(c => c.settleDeadline && c.settleDeadline < now).length,
    escrowLocked: active.reduce((s, c) => s + (c.stake || 0) * 2, 0),
  };

  const status = req.query.status || 'all';
  let list = active;
  if (status !== 'all') list = active.filter(c => c.status === status);

  return res.status(200).json({
    stats,
    disputes: disputed.map(view),
    challenges: list.map(view),
    count: list.length,
  });
}
