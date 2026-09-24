/**
 * GET /api/profile/achievements        → the authed player's own progression
 * GET /api/profile/achievements?userId= → a public read of anyone's progression
 *
 * Returns cumulative stats + derived badges (earned / next-up with progress).
 * Stats are written only at settlement (see _userstats.js), so this endpoint is
 * a pure read — no way for a client to inflate its own record here.
 */
import { requireAuth } from '../_auth.js';
import { getUserStats, cohortFromStats } from '../_userstats.js';
import { evaluateBadges } from '../_badges.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  let userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
  if (!userId) {
    const user = requireAuth(req, res);
    if (!user) return; // requireAuth already sent 401
    userId = user.userId;
  } else if (!/^[a-zA-Z0-9:_-]{3,80}$/.test(userId)) {
    return res.status(400).json({ error: 'invalid userId' });
  }

  const stats = await getUserStats(userId);
  const badges = evaluateBadges(stats);

  return res.status(200).json({
    stats: {
      played: stats.played,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.played ? Math.round((stats.wins / stats.played) * 1000) / 10 : 0,
      currentStreak: stats.currentStreak,
      bestStreak: stats.bestStreak,
      verifiedWins: stats.verifiedWins,
      byGame: stats.byGame,
      lastActiveAt: stats.lastActiveAt,
    },
    cohort: cohortFromStats(stats),
    badges,
  });
}
