/**
 * Dota 2 Match Verification Proxy
 *
 * Endpoints:
 *   GET /api/verify/dota2?steamId=76561198065933214&matchCount=5
 *   GET /api/verify/dota2?matchId=1234567890
 *
 * Environment variables required:
 *   STEAM_API_KEY — from https://steamcommunity.com/dev/apikey
 */

const BASE = 'https://api.steampowered.com';

async function steamFetch(url) {
  const res = await fetch(url);
  if (!res.ok) {
    return { error: `Steam API error: ${res.status}`, status: res.status };
  }
  return { data: await res.json(), status: 200 };
}

function extractMatchResult(match, steamId32) {
  const player = match.players.find(p => p.account_id === steamId32);
  if (!player) return null;

  const isRadiant = player.player_slot < 128;
  const radiantWin = match.radiant_win;
  const win = isRadiant ? radiantWin : !radiantWin;

  return {
    win,
    matchId: match.match_id,
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    hero: player.hero_id,
    gpm: player.gold_per_min,
    xpm: player.xp_per_min,
    lastHits: player.last_hits,
    denies: player.denies,
    damage: player.hero_damage,
    duration: Math.round(match.duration / 60),
    timestamp: match.start_time * 1000,
    lobby: match.lobby_type,
    gameMode: match.game_mode,
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'STEAM_API_KEY not configured on server' });
  }

  const { steamId, matchId, matchCount } = req.query;

  // Single match lookup
  if (matchId) {
    const result = await steamFetch(
      `${BASE}/IDOTA2Match_570/GetMatchDetails/v1/?key=${apiKey}&match_id=${matchId}`
    );
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.status(200).json({ match: result.data.result });
  }

  // Player match history
  if (!steamId) {
    return res.status(400).json({ error: 'steamId (Steam64 ID) is required' });
  }

  const count = Math.min(parseInt(matchCount) || 5, 20);
  const steam32 = parseInt(BigInt(steamId) - BigInt('76561197960265728'));

  // Get match history
  const historyResult = await steamFetch(
    `${BASE}/IDOTA2Match_570/GetMatchHistory/v1/?key=${apiKey}&account_id=${steam32}&matches_requested=${count}`
  );
  if (historyResult.error) return res.status(historyResult.status).json({ error: historyResult.error });

  const matchIds = (historyResult.data.result.matches || []).map(m => m.match_id);
  if (!matchIds.length) {
    return res.status(200).json({ player: { steamId }, matches: [], message: 'No recent matches' });
  }

  // Fetch details (parallel, max 5)
  const detailPromises = matchIds.slice(0, 5).map(id =>
    steamFetch(`${BASE}/IDOTA2Match_570/GetMatchDetails/v1/?key=${apiKey}&match_id=${id}`)
  );
  const details = await Promise.all(detailPromises);

  const matches = details
    .filter(d => d.data && d.data.result)
    .map(d => extractMatchResult(d.data.result, steam32))
    .filter(Boolean);

  return res.status(200).json({
    player: { steamId, steam32 },
    matches,
    verified: true,
    source: 'steam-dota2-api',
    fetchedAt: new Date().toISOString(),
  });
}
