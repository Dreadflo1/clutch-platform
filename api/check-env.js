export default async function handler(req, res) {
  return res.status(200).json({
    riot: process.env.RIOT_API_KEY ? 'set (' + process.env.RIOT_API_KEY.slice(0,8) + '...)' : 'NOT SET',
    clash: process.env.CLASH_ROYALE_API_KEY ? 'set (' + process.env.CLASH_ROYALE_API_KEY.slice(0,8) + '...)' : 'NOT SET',
    brawl: process.env.BRAWL_STARS_API_KEY ? 'set (' + process.env.BRAWL_STARS_API_KEY.slice(0,8) + '...)' : 'NOT SET',
    steam: process.env.STEAM_API_KEY ? 'set' : 'NOT SET',
  });
}
