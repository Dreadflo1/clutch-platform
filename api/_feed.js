/**
 * Public results feed — the real platform activity behind the landing board and
 * the shareable result cards. Only settled duels are recorded, and only what a
 * result card shows: game, mode, pot, score, display names (never emails or
 * user ids), and whether the result was auto-verified.
 *
 *   result:<challengeId>  one public result (kept 1 year, so shared links keep working)
 *   feed:results          the 30 most recent results, newest first
 *   stats:settled         lifetime settled duels
 *   stats:settled:<week>  settled duels in an ISO week (kept 5 weeks)
 */
import { kvGet, kvSet, kvIncrBy, kvListPush } from './_kv.js';
import { isoWeek, sCard } from './_registry.js';
import { gameLabel } from './_modes.js';

const RESULT_TTL = 365 * 24 * 3600;
const WEEK_TTL = 5 * 7 * 24 * 3600;
const FEED_KEY = 'feed:results';
const FEED_MAX = 30;

/** Public shape of a settled duel. Pure (unit-testable). */
export function publicResult(ch) {
  const creatorWon = ch.winner === ch.creatorUserId;
  const score = ch.finalScore
    ? (creatorWon ? [ch.finalScore.creator, ch.finalScore.opponent] : [ch.finalScore.opponent, ch.finalScore.creator])
    : null;
  return {
    id: ch.id,
    game: ch.game,
    gameLabel: gameLabel(ch.game),
    mode: ch.modeLabel || ch.mode || null,
    entry: ch.stake,
    pot: ch.payout,
    winner: (creatorWon ? ch.creatorName : ch.opponentName) || 'Player',
    loser: (creatorWon ? ch.opponentName : ch.creatorName) || 'Player',
    score,                       // [winner, loser] when the duel was settled on a scoreline
    verified: Boolean(ch.verified),
    settledAt: ch.settledAt,
  };
}

/** Record a settled duel. Best-effort: never let the feed affect the money path. */
export async function recordResult(ch) {
  try {
    const r = publicResult(ch);
    await kvSet(`result:${ch.id}`, r, RESULT_TTL);
    await kvListPush(FEED_KEY, r, { idField: 'id', max: FEED_MAX });
    await kvIncrBy('stats:settled', 1);
    const wk = `stats:settled:${isoWeek(ch.settledAt)}`;
    if ((await kvIncrBy(wk, 1)) === 1) await kvSet(wk, 1, WEEK_TTL);
  } catch (e) {
    console.warn('[feed] recordResult failed', e?.message);
  }
}

export async function getResult(id) {
  return kvGet(`result:${id}`);
}

/** Headline numbers + recent results. Every number is counted, none is estimated. */
export async function getFeed() {
  const [recent, settledTotal, settledThisWeek, players] = await Promise.all([
    kvGet(FEED_KEY),
    kvGet('stats:settled'),
    kvGet(`stats:settled:${isoWeek()}`),
    sCard('reg:all'),
  ]);
  return {
    settledTotal: Number(settledTotal) || 0,
    settledThisWeek: Number(settledThisWeek) || 0,
    players: Number(players) || 0,
    recent: Array.isArray(recent) ? recent : [],
  };
}
