/**
 * ARENA BET — API Configuration
 * ─────────────────────────────────────────────────────────────
 * Drop your API keys here. The app falls back to mock data
 * automatically if a key is missing or the quota is exceeded.
 *
 * FOR PRODUCTION: move this to a server-side environment and
 * proxy requests through your backend to keep keys private.
 */

const ARENA_CONFIG = {

  // ── FOOTBALL ──────────────────────────────────────────────
  // API-Football  →  https://www.api-football.com/
  // Free tier: 100 requests/day · Paid from $10/mo
  APIFOOTBALL_KEY: '',          // e.g. 'abc123def456...'
  APIFOOTBALL_BASE: 'https://v3.football.api-sports.io',

  // football-data.org  →  https://www.football-data.org/
  // Free tier available · Good for fixtures & standings
  FOOTBALLDATA_KEY: '',         // e.g. 'a1b2c3d4e5f6...'
  FOOTBALLDATA_BASE: 'https://api.football-data.org/v4',

  // The Odds API  →  https://the-odds-api.com/
  // Free: 500 req/month · Works directly from the browser (CORS OK)
  THEODDS_KEY: '',              // e.g. '1234abcd5678...'
  THEODDS_BASE: 'https://api.the-odds-api.com/v4',

  // ── LEAGUE OF LEGENDS ──────────────────────────────────────
  // Riot Games API  →  https://developer.riotgames.com/
  // Free with registered account · Dev key: ~100 req/2 min
  RIOT_KEY: '',                 // e.g. 'RGAPI-xxxxxxxx-xxxx-...'
  RIOT_REGION: 'europe',        // americas | europe | asia | esports
  RIOT_BASE: 'https://europe.api.riotgames.com',

  // PandaScore (esports odds)  →  https://pandascore.co/
  // Free tier: 1,000 req/hr
  PANDASCORE_KEY: '',           // e.g. 'TOKEN_abc123...'
  PANDASCORE_BASE: 'https://api.pandascore.co',

  // ── TWITCH ───────────────────────────────────────────────────
  // Twitch Developer App  →  https://dev.twitch.tv/console
  // Create an app → get Client ID + generate a Client Secret
  // The app fetches an App Access Token automatically.
  TWITCH_CLIENT_ID: '',           // e.g. 'abcdef1234567890'
  TWITCH_CLIENT_SECRET: '',       // e.g. 'xyz987...'

  // ── YOUTUBE ─────────────────────────────────────────────────
  // Google Cloud Console  →  https://console.cloud.google.com
  // Enable "YouTube Data API v3" → create an API key
  YOUTUBE_API_KEY: '',            // e.g. 'AIzaSy...'

  // ── ESPORTS NEWS (RSS) ──────────────────────────────────────
  // These are public RSS feeds — no API key needed.
  // Uses a CORS proxy for browser-side fetching.
  CORS_PROXY: 'https://api.allorigins.win/raw?url=',
  RSS_FEEDS: [
    { name: 'HLTV',         url: 'https://www.hltv.org/rss/news',              accent: '#ff6b35' },
    { name: 'Dot Esports',  url: 'https://dotesports.com/feed',                accent: '#e8344a' },
    { name: 'Dexerto',      url: 'https://www.dexerto.com/feed/',              accent: '#00d46e' },
  ],

  // ── BACKEND (Vercel Functions) ───────────────────────────────
  // All game API calls go through the backend proxy.
  // API keys are stored server-side as Vercel env vars — never in the browser.
  // Set to '' for local dev (falls back to mock data).
  API_BASE: '',  // e.g. 'https://your-app.vercel.app' — leave empty when served from same origin

  // ── PLATFORM SETTINGS ──────────────────────────────────────
  // Starting token balance for new users
  STARTING_TOKENS: 1000,

  // Token → USD rate (for display only)
  TOKEN_USD_RATE: 0.10,

  // Refresh interval for live data (milliseconds)
  LIVE_REFRESH_MS: 30000,
};
