/**
 * GET /api/stats/:game?handle=Name-Tag&region=europe
 *
 * Transparent, stat-based player profile (NOT an opaque ELO/tier ladder).
 * Aggregates the player's recent REAL matches from the game API and returns
 * readable stats + an explainable clutchScore. Cached in KV to respect rate
 * limits. MVP: League of Legends (Riot match-v5), which already has a key wired.
 */
import { kvGet, kvSet } from '../_kv.js';
import { riotResolvePuuid, riotGetMatchIds, riotGetMatchDetail, extractRiotResult } from '../_verify.js';

const CACHE_TTL = 1800; // 30 min
const MATCH_COUNT = 10;

// Explainable composite — 60% win rate, 40% normalized KDA. No hidden ELO.
export function clutchScore(winRate, avgKda) {
  const perf = Math.min(avgKda / 5, 1); // KDA of 5+ = full perf component
  return Math.round(winRate * 100 * 0.6 + perf * 100 * 0.4);
}

/** Pure aggregation of extractRiotResult rows → stats object (unit-testable). */
export function aggregateLol(rows) {
  let wins = 0, k = 0, d = 0, a = 0, cs = 0;
  rows.forEach(r => { if (r.win) wins++; k += r.kills; d += r.deaths; a += r.assists; cs += (r.cs || 0); });
  const games = rows.length;
  const winRate = games ? wins / games : 0;
  const avgKda = (k + a) / Math.max(d, 1);
  return {
    gamesPlayed: games,
    wins,
    losses: games - wins,
    winRate: Math.round(winRate * 1000) / 10, // percentage, 1 decimal
    perf: {
      kda: Math.round(avgKda * 100) / 100,
      avgKills: games ? Math.round((k / games) * 10) / 10 : 0,
      avgDeaths: games ? Math.round((d / games) * 10) / 10 : 0,
      avgAssists: games ? Math.round((a / games) * 10) / 10 : 0,
      avgCs: games ? Math.round(cs / games) : 0,
    },
    clutchScore: clutchScore(winRate, avgKda),
    scoreParts: {
      winRatePct: Math.round(winRate * 100),
      perfPct: Math.round(Math.min(avgKda / 5, 1) * 100),
      formula: '0.6 · winRate + 0.4 · min(KDA/5, 1)',
    },
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const game = String(req.query.game || '').toLowerCase();
  const handle = String(req.query.handle || '').trim();
  const region = String(req.query.region || 'europe');

  if (game !== 'lol') {
    return res.status(400).json({ error: `Stats not available for "${game}" yet — LoL only in this MVP` });
  }
  const hasSep = handle.includes('#') || handle.includes('-');
  if (!handle || !hasSep || /[<>"';&]/.test(handle) || handle.length > 60) {
    return res.status(400).json({ error: 'handle must be a Riot ID (Name#Tag)' });
  }

  const valid = ['americas', 'europe', 'asia', 'sea'];
  const routing = valid.includes(region) ? region : 'europe';
  const cacheKey = `stats:lol:${routing}:${handle.toLowerCase()}`;

  const cached = await kvGet(cacheKey);
  if (cached) return res.status(200).json({ ...cached, cached: true });

  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'RIOT_API_KEY not configured' });

  // Accept "Name#Tag" (real Riot ID) or "Name-Tag"; split on the LAST separator.
  const sepIdx = handle.lastIndexOf('#') >= 0 ? handle.lastIndexOf('#') : handle.lastIndexOf('-');
  const gameName = handle.slice(0, sepIdx);
  const tagLine = handle.slice(sepIdx + 1);

  const acct = await riotResolvePuuid(gameName, tagLine, routing, apiKey);
  if (acct.error) return res.status(acct.status || 502).json({ error: acct.error });
  const puuid = acct.data.puuid;

  const idsRes = await riotGetMatchIds(puuid, routing, MATCH_COUNT, apiKey);
  if (idsRes.error) return res.status(idsRes.status || 502).json({ error: idsRes.error });
  const ids = (idsRes.data || []).slice(0, MATCH_COUNT);
  if (!ids.length) return res.status(404).json({ error: 'No recent matches found' });

  const details = await Promise.all(ids.map(id => riotGetMatchDetail(id, routing, apiKey)));
  const rows = details.filter(d => d.data).map(d => extractRiotResult(d.data, puuid)).filter(Boolean);
  if (!rows.length) return res.status(404).json({ error: 'No usable match data' });

  const stats = {
    game: 'lol', handle, region: routing,
    ...aggregateLol(rows),
    updatedAt: Date.now(),
  };
  await kvSet(cacheKey, stats, CACHE_TTL);
  return res.status(200).json(stats);
}
