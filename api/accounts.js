/**
 * GET /api/accounts — the signed-in player's connected accounts + the data
 * gathered from each provider at OAuth time (Discord: email + servers; Twitch:
 * email + follower count; etc). Server-authoritative; the client localStorage
 * copy is only for display.
 */
import { requireAuth } from './_auth.js';
import { kvGet } from './_kv.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const user = requireAuth(req, res);
  if (!user) return;

  const list = (await kvGet(`connlist:${user.userId}`)) || [];
  const records = await Promise.all(list.map((p) => kvGet(`conn:${user.userId}:${p}`)));
  const accounts = {};
  for (const r of records) if (r && r.platform) accounts[r.platform] = r;

  return res.status(200).json({ accounts, count: Object.keys(accounts).length });
}
