/**
 * Per-user cumulative stats — the single source of truth for progression
 * (badges, streaks). Written ONLY server-side at settlement so a client can
 * never inflate its own record.
 *
 * Key: stats:user:<userId>  →  {
 *   played, wins, losses,
 *   currentStreak, bestStreak,
 *   verifiedWins,                 // wins on auto-verifiable modes (trustless)
 *   byGame: { <game>: { played, wins } },
 *   firstAt, lastActiveAt
 * }
 *
 * Updates are serialized per user with a short KV lock so two challenges
 * settling for the same player at once cannot clobber each other. Stats are
 * non-financial: a rare best-effort miss is acceptable and never blocks a
 * settlement (callers wrap this in try/catch).
 */
import { kvGet, kvSet, kvLock, kvUnlock } from './_kv.js';

const STATS_TTL = 0; // no expiry — progression is permanent

function emptyStats() {
  return {
    played: 0, wins: 0, losses: 0,
    currentStreak: 0, bestStreak: 0,
    verifiedWins: 0,
    byGame: {},
    firstAt: null, lastActiveAt: null,
  };
}

export function normalizeStats(s) {
  const base = emptyStats();
  if (!s || typeof s !== 'object') return base;
  return {
    ...base,
    ...s,
    byGame: (s.byGame && typeof s.byGame === 'object') ? s.byGame : {},
  };
}

export async function getUserStats(userId) {
  return normalizeStats(await kvGet(`stats:user:${userId}`));
}

/**
 * Skill cohort — derived, never stored, from played+wins already in
 * stats:user:<id>. Soft grouping only (used to bias Duel Board sort toward
 * similar-skill opponents), NOT a hard matchmaking restriction and NOT an
 * ELO/rating number — a player with few games is always 'Unranked' rather
 * than being mis-bucketed off a tiny sample.
 *
 * Thresholds are intentionally simple/transparent: activity gate (played)
 * then win rate.
 */
const COHORT_MIN_GAMES = 5;
export const COHORTS = ['Unranked', 'Bronze', 'Silver', 'Gold', 'Diamond'];

export function cohortFromStats(stats) {
  const s = stats || {};
  const played = s.played || 0;
  if (played < COHORT_MIN_GAMES) return 'Unranked';
  const winRate = s.wins / played;
  if (winRate >= 0.65) return 'Diamond';
  if (winRate >= 0.55) return 'Gold';
  if (winRate >= 0.45) return 'Silver';
  return 'Bronze';
}

/** Apply a win (+optional loss for the loser) to one user's stats object. */
function applyResult(stats, { win, game, verified }) {
  const now = Date.now();
  stats.played += 1;
  if (stats.firstAt == null) stats.firstAt = now;
  stats.lastActiveAt = now;
  if (game) {
    const g = stats.byGame[game] || { played: 0, wins: 0 };
    g.played += 1;
    if (win) g.wins += 1;
    stats.byGame[game] = g;
  }
  if (win) {
    stats.wins += 1;
    stats.currentStreak += 1;
    if (stats.currentStreak > stats.bestStreak) stats.bestStreak = stats.currentStreak;
    if (verified) stats.verifiedWins += 1;
  } else {
    stats.losses += 1;
    stats.currentStreak = 0;
  }
  return stats;
}

async function recordOne(userId, result) {
  const lockKey = `lock:stats:${userId}`;
  const gotLock = await kvLock(lockKey, 8);
  try {
    const stats = normalizeStats(await kvGet(`stats:user:${userId}`));
    applyResult(stats, result);
    await kvSet(`stats:user:${userId}`, stats, STATS_TTL || undefined);
    return stats;
  } finally {
    if (gotLock) await kvUnlock(lockKey);
  }
}

/**
 * Record a settled challenge for both players. Best-effort and isolated: a
 * failure here must never surface to the settlement caller.
 * @param {string} winnerId
 * @param {string} loserId
 * @param {{game?:string, verified?:boolean}} meta
 */
export async function recordSettlement(winnerId, loserId, meta = {}) {
  const game = meta.game || null;
  const verified = !!meta.verified;
  try {
    if (winnerId) await recordOne(winnerId, { win: true, game, verified });
  } catch (e) { console.warn('[userstats] winner record failed', e?.message); }
  try {
    if (loserId) await recordOne(loserId, { win: false, game, verified });
  } catch (e) { console.warn('[userstats] loser record failed', e?.message); }
}

// Exported for unit tests.
export const _internal = { emptyStats, applyResult };
