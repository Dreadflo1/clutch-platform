/**
 * Riot Games Match Verification Proxy
 *
 * Endpoints:
 *   GET /api/verify/riot?game=lol&region=europe&riotId=Name-Tag&matchCount=5
 *   GET /api/verify/riot?game=lol&region=europe&matchId=EU1_1234567
 *
 * Environment variables required:
 *   RIOT_API_KEY — from https://developer.riotgames.com
 *
 * Flow:
 *   1. Resolve Riot ID → PUUID
 *   2. Fetch recent match IDs
 *   3. Fetch match details
 *   4. Return structured win/loss data
 */

const RIOT_REGIONS = {
  americas: 'americas.api.riotgames.com',
  europe: 'europe.api.riotgames.com',
  asia: 'asia.api.riotgames.com',
  sea: 'sea.api.riotgames.com',
};

const RIOT_ACCOUNT_REGIONS = {
  americas: 'americas.api.riotgames.com',
  europe: 'europe.api.riotgames.com',
  asia: 'asia.api.riotgames.com',
};

const PLATFORM_IDS = {
  na: 'na1', euw: 'euw1', eune: 'eun1', kr: 'kr',
  br: 'br1', lan: 'la1', las: 'la2', oce: 'oc1',
  tr: 'tr1', ru: 'ru', jp: 'jp1', ph: 'ph2',
  sg: 'sg2', th: 'th2', tw: 'tw2', vn: 'vn2',
};

async function riotFetch(url, apiKey) {
  const res = await fetch(url, {
    headers: { 'X-Riot-Token': apiKey },
  });
  if (res.status === 429) {
    return { error: 'Rate limited — try again in a few seconds', status: 429 };
  }
  if (res.status === 403) {
    return { error: 'Invalid or expired API key', status: 403 };
  }
  if (res.status === 404) {
    return { error: 'Player or match not found', status: 404 };
  }
  if (!res.ok) {
    return { error: `Riot API error: ${res.status}`, status: res.status };
  }
  return { data: await res.json(), status: 200 };
}

async function resolvePuuid(gameName, tagLine, region, apiKey) {
  const host = RIOT_ACCOUNT_REGIONS[region] || RIOT_ACCOUNT_REGIONS.europe;
  const url = `https://${host}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  return riotFetch(url, apiKey);
}

async function getMatchIds(puuid, region, count, apiKey) {
  const host = RIOT_REGIONS[region] || RIOT_REGIONS.europe;
  const url = `https://${host}/lol/match/v5/matches/by-puuid/${puuid}/ids?count=${count}`;
  return riotFetch(url, apiKey);
}

async function getMatchDetail(matchId, region, apiKey) {
  const host = RIOT_REGIONS[region] || RIOT_REGIONS.europe;
  const url = `https://${host}/lol/match/v5/matches/${matchId}`;
  return riotFetch(url, apiKey);
}

function extractPlayerResult(matchData, puuid) {
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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RIOT_API_KEY not configured on server' });
  }

  const { game, region, riotId, matchId, matchCount } = req.query;
  const routingRegion = region || 'europe';

  // Single match lookup
  if (matchId) {
    const result = await getMatchDetail(matchId, routingRegion, apiKey);
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.status(200).json({ match: result.data });
  }

  // Player match history lookup
  if (!riotId || !riotId.includes('-')) {
    return res.status(400).json({ error: 'riotId must be in format Name-Tag (e.g. Player-EUW)' });
  }

  const [gameName, tagLine] = riotId.split('-');
  const count = Math.min(parseInt(matchCount) || 5, 20);

  // Step 1: Resolve Riot ID → PUUID
  const accountResult = await resolvePuuid(gameName, tagLine, routingRegion, apiKey);
  if (accountResult.error) {
    return res.status(accountResult.status).json({ error: accountResult.error });
  }
  const puuid = accountResult.data.puuid;

  // Step 2: Get recent match IDs
  const matchIdsResult = await getMatchIds(puuid, routingRegion, count, apiKey);
  if (matchIdsResult.error) {
    return res.status(matchIdsResult.status).json({ error: matchIdsResult.error });
  }
  const matchIds = matchIdsResult.data;

  if (!matchIds.length) {
    return res.status(200).json({ player: { gameName, tagLine, puuid }, matches: [], message: 'No recent matches found' });
  }

  // Step 3: Fetch match details (parallel, max 5)
  const detailPromises = matchIds.slice(0, 5).map(id => getMatchDetail(id, routingRegion, apiKey));
  const details = await Promise.all(detailPromises);

  const matches = details
    .filter(d => d.data)
    .map(d => extractPlayerResult(d.data, puuid))
    .filter(Boolean);

  return res.status(200).json({
    player: { gameName, tagLine, puuid },
    matches,
    verified: true,
    source: 'riot-api-v5',
    fetchedAt: new Date().toISOString(),
  });
}
