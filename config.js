/**
 * CLUTCH — public client configuration
 * ─────────────────────────────────────────────────────────────
 * This file is served to every visitor. NEVER put an API key, client secret
 * or token here: anything in it is public. Keys live only in Vercel
 * environment variables and are used by the /api functions (see .env.example).
 * The browser features that would need a key fall back to placeholder content.
 * tests/security.test.mjs fails if a key or secret field is added back.
 */

const ARENA_CONFIG = {

  // ── FOOTBALL ──────────────────────────────────────────────
  // API-Football  →  https://www.api-football.com/
  // Free tier: 100 requests/day · Paid from $10/mo
  APIFOOTBALL_BASE: 'https://v3.football.api-sports.io',

  // football-data.org  →  https://www.football-data.org/
  // Free tier available · Good for fixtures & standings
  FOOTBALLDATA_BASE: 'https://api.football-data.org/v4',

  // NOTE: CLUTCH is a skill-based contest platform — NOT a betting/bookmaking
  // service. It intentionally integrates NO betting-line providers of any kind.
  // Match data below is used only for informational live-score previews.

  // ── LEAGUE OF LEGENDS ──────────────────────────────────────
  // Riot Games API  →  https://developer.riotgames.com/
  // Free with registered account · Dev key: ~100 req/2 min
  RIOT_REGION: 'europe',        // americas | europe | asia | esports
  RIOT_BASE: 'https://europe.api.riotgames.com',

  // PandaScore (esports match data — schedules & results)  →  https://pandascore.co/
  // Free tier: 1,000 req/hr
  PANDASCORE_BASE: 'https://api.pandascore.co',

  // ── TWITCH ───────────────────────────────────────────────────
  // Twitch Developer App  →  https://dev.twitch.tv/console
  // Create an app → get Client ID + generate a Client Secret
  // The app fetches an App Access Token automatically.

  // ── YOUTUBE ─────────────────────────────────────────────────
  // Google Cloud Console  →  https://console.cloud.google.com
  // Enable "YouTube Data API v3" → create an API key

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

  // ── AMBASSADOR PROGRAM ─────────────────────────────────────
  // The Clutch Ambassador HQ (separate Next.js app). Set to its deployed URL
  // so the sidebar "Ambassadors" link opens the program in a new tab.
  AMBASSADOR_URL: 'https://ambassadors.clutch.best',  // TODO: set to the deployed Ambassador HQ URL

  // ── PLATFORM SETTINGS ──────────────────────────────────────
  // Starting token balance for new users
  STARTING_TOKENS: 1000,

  // Token → USD rate (for display only)
  TOKEN_USD_RATE: 0.10,

  // Refresh interval for live data (milliseconds)
  LIVE_REFRESH_MS: 30000,
};
