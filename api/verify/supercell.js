/**
 * Supercell Match Verification Proxy (Clash Royale + Brawl Stars)
 *
 * Endpoints:
 *   GET /api/verify/supercell?game=clashroyale&playerTag=%23ABC123
 *   GET /api/verify/supercell?game=brawlstars&playerTag=%23ABC123
 *
 * Environment variables required:
 *   CLASH_ROYALE_API_KEY — from https://developer.clashroyale.com
 *   BRAWL_STARS_API_KEY  — from https://developer.brawlstars.com
 */

const APIS = {
  clashroyale: {
    base: 'https://api.clashroyale.com/v1',
    envKey: 'CLASH_ROYALE_API_KEY',
  },
  brawlstars: {
    base: 'https://api.brawlstars.com/v1',
    envKey: 'BRAWL_STARS_API_KEY',
  },
};

async function scFetch(url, apiKey) {
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (res.status === 403) return { error: 'Invalid API key or IP not whitelisted', status: 403 };
  if (res.status === 404) return { error: 'Player not found', status: 404 };
  if (res.status === 429) return { error: 'Rate limited', status: 429 };
  if (!res.ok) return { error: `API error: ${res.status}`, status: res.status };
  return { data: await res.json(), status: 200 };
}

function extractCRBattle(battle) {
  const team = battle.team || [];
  const opponent = battle.opponent || [];
  const myCrowns = team[0] ? team[0].crowns : 0;
  const oppCrowns = opponent[0] ? opponent[0].crowns : 0;

  let win = null;
  if (myCrowns > oppCrowns) win = true;
  else if (myCrowns < oppCrowns) win = false;
  else win = null; // draw

  return {
    win,
    type: battle.type,
    timestamp: battle.battleTime,
    myCrowns,
    opponentCrowns: oppCrowns,
    myTrophyChange: team[0] ? team[0].trophyChange : 0,
    arena: battle.arena ? battle.arena.name : null,
    deckCards: team[0] ? team[0].cards.map(c => c.name) : [],
    opponentName: opponent[0] ? opponent[0].name : 'Unknown',
  };
}

function extractBSBattle(battle) {
  const result = battle.battle ? battle.battle.result : null;
  return {
    win: result === 'victory',
    loss: result === 'defeat',
    draw: result === 'draw',
    mode: battle.battle ? battle.battle.mode : null,
    type: battle.battle ? battle.battle.type : null,
    timestamp: battle.battleTime,
    trophyChange: battle.battle ? battle.battle.trophyChange : 0,
    starPlayer: battle.battle ? battle.battle.starPlayer : null,
    brawler: battle.battle && battle.battle.players
      ? battle.battle.players[0] ? battle.battle.players[0].brawler.name : null
      : null,
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { game, playerTag } = req.query;

  if (!game || !APIS[game]) {
    return res.status(400).json({ error: 'game must be "clashroyale" or "brawlstars"' });
  }
  if (!playerTag) {
    return res.status(400).json({ error: 'playerTag is required (e.g. %23ABC123)' });
  }

  const config = APIS[game];
  const apiKey = process.env[config.envKey];
  if (!apiKey) {
    return res.status(500).json({ error: `${config.envKey} not configured on server` });
  }

  const encodedTag = playerTag.startsWith('%23') ? playerTag : '%23' + playerTag.replace('#', '');

  // Fetch player profile
  const profileResult = await scFetch(`${config.base}/players/${encodedTag}`, apiKey);
  if (profileResult.error) return res.status(profileResult.status).json({ error: profileResult.error });

  // Fetch battle log
  const battleResult = await scFetch(`${config.base}/players/${encodedTag}/battlelog`, apiKey);
  if (battleResult.error) return res.status(battleResult.status).json({ error: battleResult.error });

  const battles = battleResult.data.items || battleResult.data || [];
  const extractor = game === 'clashroyale' ? extractCRBattle : extractBSBattle;
  const matches = battles.slice(0, 10).map(extractor);

  return res.status(200).json({
    player: {
      tag: profileResult.data.tag,
      name: profileResult.data.name,
      trophies: profileResult.data.trophies,
      level: profileResult.data.expLevel || profileResult.data.level,
    },
    matches,
    verified: true,
    source: `supercell-${game}-api`,
    fetchedAt: new Date().toISOString(),
  });
}
