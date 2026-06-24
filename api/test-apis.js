export default async function handler(req, res) {
  var results = {};

  // Test Riot
  var riotKey = process.env.RIOT_API_KEY;
  if (riotKey) {
    try {
      var r = await fetch('https://europe.api.riotgames.com/lol/status/v4/platform-data', {
        headers: { 'X-Riot-Token': riotKey }
      });
      var body = await r.text();
      results.riot = { status: r.status, body: body.slice(0, 200), keyPrefix: riotKey.slice(0, 12) };
    } catch (e) {
      results.riot = { error: e.message };
    }
  } else {
    results.riot = { error: 'RIOT_API_KEY not set' };
  }

  // Test Clash Royale
  var crKey = process.env.CLASH_ROYALE_API_KEY;
  if (crKey) {
    try {
      var r2 = await fetch('https://api.clashroyale.com/v1/locations', {
        headers: { 'Authorization': 'Bearer ' + crKey }
      });
      var body2 = await r2.text();
      results.clash = { status: r2.status, body: body2.slice(0, 200), keyPrefix: crKey.slice(0, 12) };
    } catch (e) {
      results.clash = { error: e.message };
    }
  } else {
    results.clash = { error: 'CLASH_ROYALE_API_KEY not set' };
  }

  // Test Brawl Stars
  var bsKey = process.env.BRAWL_STARS_API_KEY;
  if (bsKey) {
    try {
      var r3 = await fetch('https://api.brawlstars.com/v1/brawlers', {
        headers: { 'Authorization': 'Bearer ' + bsKey }
      });
      var body3 = await r3.text();
      results.brawl = { status: r3.status, body: body3.slice(0, 200), keyPrefix: bsKey.slice(0, 12) };
    } catch (e) {
      results.brawl = { error: e.message };
    }
  } else {
    results.brawl = { error: 'BRAWL_STARS_API_KEY not set' };
  }

  // Outbound IP
  try {
    var ip = await fetch('https://api.ipify.org?format=json');
    results.serverIp = (await ip.json()).ip;
  } catch (e) {
    results.serverIp = 'unknown';
  }

  return res.status(200).json(results);
}
