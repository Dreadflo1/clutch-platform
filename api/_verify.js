/**
 * Match verification library — shared by the /api/verify/* endpoints and by
 * challenge settlement, so there is ONE source of truth for "did this player
 * win this match" instead of trusting what the players type.
 *
 * Trustless settlement (see challenges/settle.js) currently supports the games
 * that expose a per-match lookup keyed by a stable match id: League of Legends
 * (Riot match-v5) and Dota 2 (Steam GetMatchDetails). Supercell games use a
 * rolling battlelog with no match id, so they stay on result-based settlement.
 */

// Games whose outcome we can verify from a match id.
export const VERIFIABLE_GAMES = ['lol', 'dota2'];

export function isVerifiable(game) {
  return VERIFIABLE_GAMES.includes(game);
}

// ── Pure extractors (no network — unit-testable) ────────────────
export function extractRiotResult(matchData, puuid) {
  const info = matchData.info;
  const participant = info.participants.find(p => p.puuid === puuid);
  if (!participant) return null;
  return {
    win: participant.win,
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    champion: participant.championName,
    role: participant.teamPosition,
    cs: participant.totalMinionsKilled + participant.neutralMinionsKilled,
    damage: participant.totalDamageDealtToChampions,
    gold: participant.goldEarned,
    duration: Math.round(info.gameDuration / 60),
    gameMode: info.gameMode,
    gameType: info.gameType,
    queueId: info.queueId,
    matchId: matchData.metadata.matchId,
    timestamp: info.gameStartTimestamp,
    gameVersion: info.gameVersion,
  };
}

export function extractDotaResult(match, steamId32) {
  const player = match.players.find(p => p.account_id === steamId32);
  if (!player) return null;
  const isRadiant = player.player_slot < 128;
  const win = isRadiant ? match.radiant_win : !match.radiant_win;
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

// ── Riot fetch layer ────────────────────────────────────────────
const RIOT_REGIONS = {
  americas: 'americas.api.riotgames.com',
  europe: 'europe.api.riotgames.com',
  asia: 'asia.api.riotgames.com',
  sea: 'sea.api.riotgames.com',
};

async function riotFetch(url, apiKey) {
  const res = await fetch(url, { headers: { 'X-Riot-Token': apiKey } });
  if (res.status === 429) return { error: 'Rate limited', status: 429 };
  if (res.status === 403) return { error: 'Invalid or expired API key', status: 403 };
  if (res.status === 404) return { error: 'Player or match not found', status: 404 };
  if (!res.ok) return { error: `Riot API error: ${res.status}`, status: res.status };
  return { data: await res.json(), status: 200 };
}

export async function riotResolvePuuid(gameName, tagLine, region, apiKey) {
  const host = RIOT_REGIONS[region] || RIOT_REGIONS.europe;
  const url = `https://${host}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  return riotFetch(url, apiKey);
}

export async function riotGetMatchIds(puuid, region, count, apiKey) {
  const host = RIOT_REGIONS[region] || RIOT_REGIONS.europe;
  const url = `https://${host}/lol/match/v5/matches/by-puuid/${puuid}/ids?count=${count}`;
  return riotFetch(url, apiKey);
}

export async function riotGetMatchDetail(matchId, region, apiKey) {
  const host = RIOT_REGIONS[region] || RIOT_REGIONS.europe;
  const url = `https://${host}/lol/match/v5/matches/${matchId}`;
  return riotFetch(url, apiKey);
}

// ── Steam / Dota 2 fetch layer ──────────────────────────────────
const STEAM_BASE = 'https://api.steampowered.com';

async function steamFetch(url) {
  const res = await fetch(url);
  if (!res.ok) return { error: `Steam API error: ${res.status}`, status: res.status };
  return { data: await res.json(), status: 200 };
}

export function steamId64To32(steamId64) {
  return parseInt(BigInt(steamId64) - BigInt('76561197960265728'));
}

export async function dotaGetMatchDetail(matchId, apiKey) {
  return steamFetch(`${STEAM_BASE}/IDOTA2Match_570/GetMatchDetails/v1/?key=${apiKey}&match_id=${matchId}`);
}

/**
 * Resolve one player's outcome for a specific match.
 * @returns {Promise<{ok:true, win:boolean, matchId:string|number, timestamp:number}
 *                    | {ok:false, error:string, status?:number}>}
 */
export async function resolveOutcome({ game, region, matchId, handle }) {
  if (!isVerifiable(game)) {
    return { ok: false, error: `Auto-verification not supported for game "${game}"` };
  }
  if (!matchId || !handle) {
    return { ok: false, error: 'matchId and handle are required' };
  }

  if (game === 'lol') {
    const apiKey = process.env.RIOT_API_KEY;
    if (!apiKey) return { ok: false, error: 'RIOT_API_KEY not configured', status: 500 };
    if (!/^[A-Z]{2,4}_\d{6,15}$/.test(matchId)) return { ok: false, error: 'Invalid LoL match id', status: 400 };
    if (typeof handle !== 'string' || !handle.includes('-')) {
      return { ok: false, error: 'handle must be a Riot ID (Name-Tag)', status: 400 };
    }
    const parts = handle.split('-');
    const gameName = parts.slice(0, -1).join('-');
    const tagLine = parts[parts.length - 1];
    const validRegions = ['americas', 'europe', 'asia', 'sea'];
    const routing = validRegions.includes(region) ? region : 'europe';

    const acct = await riotResolvePuuid(gameName, tagLine, routing, apiKey);
    if (acct.error) return { ok: false, error: acct.error, status: acct.status };
    const detail = await riotGetMatchDetail(matchId, routing, apiKey);
    if (detail.error) return { ok: false, error: detail.error, status: detail.status };
    const r = extractRiotResult(detail.data, acct.data.puuid);
    if (!r) return { ok: false, error: 'Player did not take part in that match', status: 400 };
    return { ok: true, win: r.win, matchId: r.matchId, timestamp: r.timestamp };
  }

  if (game === 'dota2') {
    const apiKey = process.env.STEAM_API_KEY;
    if (!apiKey) return { ok: false, error: 'STEAM_API_KEY not configured', status: 500 };
    if (!/^\d{6,15}$/.test(String(matchId))) return { ok: false, error: 'Invalid Dota 2 match id', status: 400 };
    if (!/^\d{17}$/.test(String(handle))) return { ok: false, error: 'handle must be a Steam64 id', status: 400 };
    const detail = await dotaGetMatchDetail(matchId, apiKey);
    if (detail.error) return { ok: false, error: detail.error, status: detail.status };
    const match = detail.data && detail.data.result;
    if (!match) return { ok: false, error: 'Match not found', status: 404 };
    const r = extractDotaResult(match, steamId64To32(handle));
    if (!r) return { ok: false, error: 'Player did not take part in that match', status: 400 };
    return { ok: true, win: r.win, matchId: r.matchId, timestamp: r.timestamp };
  }

  return { ok: false, error: 'Unsupported game' };
}
