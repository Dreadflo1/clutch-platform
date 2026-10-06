/**
 * GET /api/feed                → { settledTotal, settledThisWeek, players, recent[] }
 * GET /api/feed?recap=week     → { text } a ready-to-post weekly recap built only
 *                                from counted numbers (for socials / Discord)
 *
 * Public and CDN-cached for a minute, so the landing board costs a handful of
 * KV reads per minute however many people load it.
 */
import { getFeed } from './_feed.js';

export function weeklyRecap(feed) {
  const lines = [];
  const n = feed.settledThisWeek;
  lines.push(n === 1 ? 'This week on CLUTCH: 1 duel settled.' : `This week on CLUTCH: ${n} duels settled.`);
  const week = feed.recent.filter(r => Date.now() - r.settledAt < 7 * 24 * 3600 * 1000);
  const wins = {};
  for (const r of week) wins[r.winner] = (wins[r.winner] || 0) + 1;
  const top = Object.entries(wins).sort((a, b) => b[1] - a[1])[0];
  if (top) lines.push(`Most wins: ${top[0]} (${top[1]}).`);
  const biggest = week.slice().sort((a, b) => (b.pot || 0) - (a.pot || 0))[0];
  if (biggest) lines.push(`Biggest pot: ${biggest.pot} CLU in ${biggest.gameLabel}, won by ${biggest.winner}.`);
  const verified = week.filter(r => r.verified).length;
  if (verified) lines.push(`${verified} of them verified straight from the game's match data.`);
  lines.push('Think you can beat them? clutch.best');
  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const feed = await getFeed();
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  if (req.query.recap === 'week') return res.status(200).json({ text: weeklyRecap(feed) });
  return res.status(200).json(feed);
}
