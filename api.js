/**
 * ARENA BET — API Client
 * ─────────────────────────────────────────────────────────────
 * Proxy-ready API layer. Each function tries the real API first,
 * falls back to mock data if the key is missing or the call fails.
 *
 * CORS NOTE: Most sports APIs block direct browser calls.
 * To go live, point PROXY_BASE to your own backend:
 *
 *   const PROXY_BASE = 'https://your-api.com/proxy';
 *
 * Your backend then forwards requests with the secret key.
 * When PROXY_BASE is '', direct API calls are attempted.
 */

const PROXY_BASE = ''; // e.g. 'https://your-backend.com/proxy'

/* ────────────────────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────────────────────── */
async function apiFetch(url, headers = {}) {
  try {
    const target = PROXY_BASE ? `${PROXY_BASE}?url=${encodeURIComponent(url)}` : url;
    const res = await fetch(target, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('[Arena API] Failed:', url, e.message);
    return null;
  }
}

function hasKey(key) { return key && key.trim().length > 10; }

/* ────────────────────────────────────────────────────────────
   FOOTBALL — LIVE MATCHES
   Returns an array of match objects normalised for the UI.
──────────────────────────────────────────────────────────── */
async function fetchLiveMatches() {
  // ── Try API-Football first ──────────────────────────────
  if (hasKey(ARENA_CONFIG.APIFOOTBALL_KEY)) {
    const data = await apiFetch(
      `${ARENA_CONFIG.APIFOOTBALL_BASE}/fixtures?live=all`,
      {
        'x-apisports-key': ARENA_CONFIG.APIFOOTBALL_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io',
      }
    );
    if (data?.response?.length) {
      return data.response.slice(0, 6).map(normaliseAPIFootballMatch);
    }
  }

  // ── Fallback: football-data.org ─────────────────────────
  if (hasKey(ARENA_CONFIG.FOOTBALLDATA_KEY)) {
    const data = await apiFetch(
      `${ARENA_CONFIG.FOOTBALLDATA_BASE}/matches?status=IN_PLAY`,
      { 'X-Auth-Token': ARENA_CONFIG.FOOTBALLDATA_KEY }
    );
    if (data?.matches?.length) {
      return data.matches.slice(0, 6).map(normaliseFootballDataMatch);
    }
  }

  // ── Final fallback: mock data ───────────────────────────
  console.info('[Arena API] Using mock football data — add API keys in config.js');
  return null; // caller uses MOCK_MATCHES
}

/* ────────────────────────────────────────────────────────────
   FOOTBALL — ODDS
   Returns odds for a given fixture from The Odds API.
──────────────────────────────────────────────────────────── */
async function fetchOdds(sport = 'soccer_fifa_world_cup') {
  if (!hasKey(ARENA_CONFIG.THEODDS_KEY)) return null;

  const data = await apiFetch(
    `${ARENA_CONFIG.THEODDS_BASE}/sports/${sport}/odds/?apiKey=${ARENA_CONFIG.THEODDS_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`
  );
  if (!data?.length) return null;

  // Returns { matchTitle: { home, draw, away } }
  const map = {};
  data.forEach(function(event) {
    const bm = event.bookmakers?.[0];
    if (!bm) return;
    const h2h = bm.markets?.find(function(m){ return m.key === 'h2h'; });
    if (!h2h) return;
    const outcomes = {};
    h2h.outcomes.forEach(function(o){ outcomes[o.name] = o.price; });
    map[event.home_team + ' vs ' + event.away_team] = {
      home: outcomes[event.home_team] || 2.0,
      draw: outcomes['Draw'] || 3.2,
      away: outcomes[event.away_team] || 3.5,
    };
  });
  return map;
}

/* ────────────────────────────────────────────────────────────
   LOL — FEATURED GAMES (lobby/match previews)
   Returns up to 5 live LoL games from Riot spectator API.
──────────────────────────────────────────────────────────── */
async function fetchLoLFeaturedGames() {
  if (!hasKey(ARENA_CONFIG.RIOT_KEY)) return null;

  // Spectator v5 — featured games (no summoner lookup needed)
  const data = await apiFetch(
    `${ARENA_CONFIG.RIOT_BASE}/lol/spectator/v5/featured-games`,
    { 'X-Riot-Token': ARENA_CONFIG.RIOT_KEY }
  );
  if (!data?.gameList) return null;

  return data.gameList.slice(0, 6).map(normaliseLoLGame);
}

/* ────────────────────────────────────────────────────────────
   LOL — PRO MATCH SCHEDULE via PandaScore
──────────────────────────────────────────────────────────── */
async function fetchLoLProMatches() {
  if (!hasKey(ARENA_CONFIG.PANDASCORE_KEY)) return null;

  const data = await apiFetch(
    `${ARENA_CONFIG.PANDASCORE_BASE}/lol/matches/running?token=${ARENA_CONFIG.PANDASCORE_KEY}&per_page=6`
  );
  if (!data?.length) return null;

  return data.map(normaliseLoLProMatch);
}

/* ────────────────────────────────────────────────────────────
   LOL — SUMMONER PROFILE (for player stats sidebar)
──────────────────────────────────────────────────────────── */
async function fetchSummonerByName(summonerName, region) {
  if (!hasKey(ARENA_CONFIG.RIOT_KEY)) return null;

  const regionBase = {
    euw:    'https://euw1.api.riotgames.com',
    na:     'https://na1.api.riotgames.com',
    kr:     'https://kr.api.riotgames.com',
    eune:   'https://eun1.api.riotgames.com',
  };
  const base = regionBase[region] || 'https://euw1.api.riotgames.com';

  return await apiFetch(
    `${base}/lol/summoner/v4/summoners/by-name/${encodeURIComponent(summonerName)}`,
    { 'X-Riot-Token': ARENA_CONFIG.RIOT_KEY }
  );
}

/* ────────────────────────────────────────────────────────────
   NORMALISERS — map raw API shapes to UI schema
──────────────────────────────────────────────────────────── */
function normaliseAPIFootballMatch(f) {
  const fx = f.fixture, teams = f.teams, goals = f.goals, status = f.fixture.status;
  return {
    id:     'live-' + fx.id,
    s:      status.elapsed ? 'live' : 'up',
    min:    status.elapsed || 0,
    lg:     f.league.name + ' · ' + f.league.round,
    home:   { name: teams.home.name, code: teams.home.name.slice(0,3).toUpperCase(), bg:'#1a2035', fg:'#dde2f0' },
    away:   { name: teams.away.name, code: teams.away.name.slice(0,3).toUpperCase(), bg:'#1a2035', fg:'#dde2f0' },
    sc:     { h: goals.home ?? 0, a: goals.away ?? 0 },
    odds:   { h: 2.0, d: 3.2, a: 3.5 }, // overwritten by fetchOdds()
    _raw:   f,
  };
}

function normaliseFootballDataMatch(m) {
  return {
    id:   'fdo-' + m.id,
    s:    m.status === 'IN_PLAY' ? 'live' : 'up',
    min:  m.minute || 0,
    lg:   m.competition.name,
    home: { name: m.homeTeam.name, code: m.homeTeam.tla || m.homeTeam.name.slice(0,3).toUpperCase(), bg:'#1a2035', fg:'#dde2f0' },
    away: { name: m.awayTeam.name, code: m.awayTeam.tla || m.awayTeam.name.slice(0,3).toUpperCase(), bg:'#1a2035', fg:'#dde2f0' },
    sc:   { h: m.score.fullTime.home ?? 0, a: m.score.fullTime.away ?? 0 },
    odds: { h: 2.0, d: 3.2, a: 3.5 },
    _raw: m,
  };
}

function normaliseLoLGame(g) {
  const blue = g.participants.filter(function(p){ return p.teamId === 100; });
  const red  = g.participants.filter(function(p){ return p.teamId === 200; });
  const elapsed = Math.floor(g.gameLength / 60);
  return {
    id:       'lol-' + g.gameId,
    s:        'live',
    min:      elapsed,
    type:     g.gameMode,
    blue:     blue.map(function(p){ return { summonerName: p.summonerName, champion: p.championId }; }),
    red:      red.map(function(p){ return  { summonerName: p.summonerName, champion: p.championId }; }),
    odds:     { blue: 1.85, red: 1.95 },
    _raw:     g,
  };
}

function normaliseLoLProMatch(m) {
  const t1 = m.opponents?.[0]?.opponent;
  const t2 = m.opponents?.[1]?.opponent;
  return {
    id:      'lol-pro-' + m.id,
    s:       m.status === 'running' ? 'live' : 'up',
    league:  m.league?.name || 'Esports',
    series:  m.serie?.full_name || '',
    team1:   { name: t1?.name || 'TBD', acronym: t1?.acronym || 'T1', bg: '#1a2035', fg: '#dde2f0', logo: t1?.image_url || null },
    team2:   { name: t2?.name || 'TBD', acronym: t2?.acronym || 'T2', bg: '#2a1a1a', fg: '#dde2f0', logo: t2?.image_url || null },
    bo:      m.number_of_games || 1,
    scores:  { t1: m.results?.[0]?.score || 0, t2: m.results?.[1]?.score || 0 },
    odds:    { t1: 1.9, t2: 1.9 },
    _raw:    m,
  };
}

/* ────────────────────────────────────────────────────────────
   REFRESH LOOP
   Call startLiveRefresh() once the app is ready.
──────────────────────────────────────────────────────────── */
function startLiveRefresh(onFootballUpdate, onLoLUpdate) {
  async function tick() {
    const [football, lolFeatured, lolPro] = await Promise.all([
      fetchLiveMatches(),
      fetchLoLFeaturedGames(),
      fetchLoLProMatches(),
    ]);

    if (football && onFootballUpdate) onFootballUpdate(football);
    const lol = lolPro || lolFeatured;
    if (lol && onLoLUpdate) onLoLUpdate(lol);
  }

  tick(); // immediate first fetch
  return setInterval(tick, ARENA_CONFIG.LIVE_REFRESH_MS);
}
