/**
 * Duels board data model — mirrors the live platform's challenge catalog so the
 * Next.js board renders identically to the vanilla app and can consume the same
 * GET /api/challenges response shape.
 */

export type GameVerify = "auto" | "screenshot";

export type Game = {
  id: string;
  name: string;
  short: string;
  color: string;
  verify: GameVerify;
  apiName: string | null;
};

/** Same catalog and brand colors as the live platform (app.js GAMES). */
export const GAMES: Game[] = [
  { id: "valorant", name: "Valorant", short: "VAL", color: "#ff4655", verify: "auto", apiName: "Riot API" },
  { id: "lol", name: "League of Legends", short: "LoL", color: "#c89b3c", verify: "auto", apiName: "Riot API" },
  { id: "dota2", name: "Dota 2", short: "DOTA", color: "#c23c2a", verify: "auto", apiName: "Steam API" },
  { id: "cs2", name: "Counter-Strike 2", short: "CS2", color: "#de9b35", verify: "screenshot", apiName: null },
  { id: "fortnite", name: "Fortnite", short: "FN", color: "#9d4dff", verify: "screenshot", apiName: null },
  { id: "apex", name: "Apex Legends", short: "APEX", color: "#FF4D5E", verify: "screenshot", apiName: null },
  { id: "rl", name: "Rocket League", short: "RL", color: "#0078f2", verify: "screenshot", apiName: null },
  { id: "ow2", name: "Overwatch 2", short: "OW2", color: "#f99e1a", verify: "screenshot", apiName: null },
  { id: "clashroyale", name: "Clash Royale", short: "CR", color: "#4ba3e3", verify: "screenshot", apiName: null },
  { id: "fifa", name: "EA FC", short: "FC", color: "#00FF87", verify: "screenshot", apiName: null },
];

const GAME_BY_ID = new Map(GAMES.map((g) => [g.id, g]));

export function gameById(id: string): Game {
  return (
    GAME_BY_ID.get(id) ?? { id, name: id, short: id.slice(0, 4).toUpperCase(), color: "#8a95b3", verify: "screenshot", apiName: null }
  );
}

/**
 * A board challenge as returned by the live API (open challenges). Optional
 * fields cover both the server payload and richer sample rows.
 */
export type Challenge = {
  id: string;
  game: string;
  stake: number;
  creatorName: string;
  creatorWins?: number;
  modeLabel?: string;
  mode?: string;
  modeVerifiable?: boolean;
  status?: string;
  createdAt?: number;
  expiresAt?: number;
  verified?: boolean;
  rank?: string;
};

export type BoardResponse = {
  challenges: Challenge[];
  /** "live" when proxied from the platform API, "sample" when the demo set. */
  source: "live" | "sample";
};

export function isFree(c: Challenge) {
  return !c.stake || c.stake <= 0;
}

export function timeAgo(ts?: number) {
  if (!ts) return "just now";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function expiresIn(ts?: number) {
  if (!ts) return "";
  const s = Math.floor((ts - Date.now()) / 1000);
  if (s <= 0) return "expired";
  const h = Math.floor(s / 3600);
  if (h >= 1) return `${h}h left`;
  return `${Math.max(1, Math.floor(s / 60))}m left`;
}

const HOUR = 3600000;

/**
 * Sample board shown before the live API is wired (or when it is unreachable),
 * so /duels always renders on-brand. Clearly labeled "sample" in the UI.
 */
export const seedChallenges: Challenge[] = [
  { id: "S1", game: "valorant", stake: 250, creatorName: "AceOnly", creatorWins: 12, modeLabel: "First to 13 · Competitive", modeVerifiable: true, verified: true, rank: "Immortal 2", createdAt: Date.now() - 8 * 60000, expiresAt: Date.now() + 5 * HOUR },
  { id: "S2", game: "lol", stake: 0, creatorName: "MidDiffAndy", creatorWins: 4, modeLabel: "1v1 mid · First blood or tower", modeVerifiable: true, verified: true, rank: "Diamond IV", createdAt: Date.now() - 22 * 60000, expiresAt: Date.now() + 3 * HOUR },
  { id: "S3", game: "dota2", stake: 500, creatorName: "PosFiveDiff", creatorWins: 9, modeLabel: "1v1 solo mid · First to 2", modeVerifiable: true, verified: true, rank: "Divine", createdAt: Date.now() - 41 * 60000, expiresAt: Date.now() + 9 * HOUR },
  { id: "S4", game: "cs2", stake: 120, creatorName: "clutch_or_kick", creatorWins: 6, modeLabel: "Aim map · First to 16", modeVerifiable: false, verified: false, rank: "Faceit 8", createdAt: Date.now() - 55 * 60000, expiresAt: Date.now() + 2 * HOUR },
  { id: "S5", game: "rl", stake: 80, creatorName: "AerialGoblin", creatorWins: 3, modeLabel: "1v1 · First to 5 goals", modeVerifiable: false, verified: true, rank: "Champion I", createdAt: Date.now() - 70 * 60000, expiresAt: Date.now() + 6 * HOUR },
  { id: "S6", game: "apex", stake: 0, creatorName: "RingRunner", creatorWins: 2, modeLabel: "1v1 box fight · Best of 3", modeVerifiable: false, verified: false, rank: "Diamond", createdAt: Date.now() - 96 * 60000, expiresAt: Date.now() + 4 * HOUR },
  { id: "S7", game: "fortnite", stake: 150, creatorName: "BuildOrCry", creatorWins: 8, modeLabel: "Box fight · First to 5 elims", modeVerifiable: false, verified: true, rank: "Champion", createdAt: Date.now() - 130 * 60000, expiresAt: Date.now() + 7 * HOUR },
  { id: "S8", game: "ow2", stake: 200, creatorName: "SupportDiff", creatorWins: 5, modeLabel: "1v1 Mystery Heroes · First to 5", modeVerifiable: false, verified: false, rank: "Masters", createdAt: Date.now() - 175 * 60000, expiresAt: Date.now() + 8 * HOUR },
];
