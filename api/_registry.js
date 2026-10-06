/**
 * Player registry — the single list of CLUTCH accounts, whatever the sign-up
 * path (email, wallet, Telegram, Discord), plus what it takes to count REAL
 * players and exclude fraud/bots.
 *
 * A *qualified* player is a distinct account that
 *   1. has a game handle (Riot ID / Steam ID) bound to it (ghandle:* binding),
 *   2. finished at least one settled duel against a different account,
 *   3. is not banned and not flagged as a likely multi-account.
 *
 * Keys:
 *   reg:<userId>          record { userId, via, createdAt, ipHash, ref, handles[], duels, firstDuelAt, lastDuelAt, duelTs[], opponents[], qualifiedAt }
 *   reg:all               SET of every registered userId
 *   reg:qualified         SET of qualified userIds
 *   regip:<ipHash>:<week> SET of userIds created from that IP hash that ISO week
 *
 * Privacy: the IP is never stored, only a salted SHA-256 prefix, used solely
 * for fraud detection (legitimate interest, see GROWTH.md section 4).
 * Every function is best-effort: a registry failure must never block sign-up
 * or a money settlement.
 */
import crypto from 'crypto';
import { kvGet, kvSet, kvSetNx, kvActive, kvEval, memGetSync, memSetSync } from './_kv.js';
import { clientIp } from './_ratelimit.js';
import { auditLog } from './_log.js';

export const STARTING_GRANT = 500;          // CLU every new account receives
export const WEEKLY_TARGET = 20;            // qualified players per week (STRATEGY.md)
export const IP_CLUSTER_LIMIT = 3;          // > this many accounts / IP hash / week = flagged
export const CLOSED_PAIR_MIN_DUELS = 3;     // only flag a closed pair after this many duels
const DUEL_TS_CAP = 200;
const OPPONENTS_CAP = 100;
const DAY = 24 * 3600 * 1000;

// ── tiny set helpers (atomic SADD in Redis, array in dev memory) ─────
const LUA_SADD = "return redis.call('SADD', KEYS[1], ARGV[1])";
const LUA_SMEMBERS = "return redis.call('SMEMBERS', KEYS[1])";
const LUA_SCARD = "return redis.call('SCARD', KEYS[1])";

async function sAdd(key, member) {
  if (kvActive()) return Number(await kvEval(LUA_SADD, [key], [member])) || 0;
  const cur = memGetSync(key) || [];
  if (cur.includes(member)) return 0;
  memSetSync(key, [...cur, member]);
  return 1;
}
export async function sMembers(key) {
  if (kvActive()) return (await kvEval(LUA_SMEMBERS, [key], [])) || [];
  return memGetSync(key) || [];
}
async function sCard(key) {
  if (kvActive()) return Number(await kvEval(LUA_SCARD, [key], [])) || 0;
  return (memGetSync(key) || []).length;
}

// ── helpers ──────────────────────────────────────────────────────────
export function isoWeek(ts = Date.now()) {
  const d = new Date(ts);
  const day = (d.getUTCDay() + 6) % 7;                 // Mon=0
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thursday - yearStart) / DAY - 3 + ((yearStart.getUTCDay() + 6) % 7)) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function hashIp(ip) {
  const salt = process.env.REGISTRY_SALT || process.env.JWT_SECRET || 'dev-registry-salt';
  return crypto.createHash('sha256').update(salt + '|' + String(ip || 'unknown')).digest('hex').slice(0, 16);
}

/** Campaign/referral tag, sanitized: lowercase letters, digits, - _ . : only, max 64. */
export function cleanRef(ref) {
  if (!ref) return null;
  const s = String(ref).toLowerCase().replace(/[^a-z0-9_.:-]/g, '').slice(0, 64);
  return s || null;
}

// ── writes ───────────────────────────────────────────────────────────
/**
 * Register a newly created account (exactly once). `req` gives the IP; `ref`
 * is the campaign tag (utm_source / ?ref=). Returns true if newly registered.
 */
export async function registerAccount(userId, { via = 'unknown', req = null, ref = null, createdAt = Date.now() } = {}) {
  try {
    const ipHash = req ? hashIp(clientIp(req)) : null;
    const rec = {
      userId, via, createdAt, ipHash, ref: cleanRef(ref),
      handles: [], duels: 0, firstDuelAt: null, lastDuelAt: null, duelTs: [], opponents: [], qualifiedAt: null,
    };
    const created = await kvSetNx(`reg:${userId}`, rec);
    if (!created) return false;
    await sAdd('reg:all', userId);
    if (ipHash) await sAdd(`regip:${ipHash}:${isoWeek(createdAt)}`, userId);
    auditLog('registry.account', { userId, via, ref: rec.ref });
    return true;
  } catch (e) {
    console.warn('[registry] register failed', e?.message);
    return false;
  }
}

/** Make sure an account that predates the registry is in it (no IP, via 'legacy'). */
export async function ensureRegistered(userId, via = 'legacy') {
  return registerAccount(userId, { via, createdAt: Date.now() });
}

/** Record that a game handle is bound to this account. */
export async function markHandle(userId, game, handle) {
  try {
    await ensureRegistered(userId);
    const rec = await kvGet(`reg:${userId}`);
    if (!rec) return;
    const tag = `${game}:${String(handle).trim().toLowerCase()}`;
    if (!rec.handles.includes(tag)) {
      rec.handles.push(tag);
      await kvSet(`reg:${userId}`, rec);
      await maybeQualify(rec);
    }
  } catch (e) {
    console.warn('[registry] markHandle failed', e?.message);
  }
}

/** Record a settled duel for both players (called from settleToWinner). */
export async function recordDuel(aId, bId, ts = Date.now()) {
  for (const [me, opp] of [[aId, bId], [bId, aId]]) {
    try {
      await ensureRegistered(me);
      const rec = await kvGet(`reg:${me}`);
      if (!rec) continue;
      rec.duels = (rec.duels || 0) + 1;
      rec.firstDuelAt = rec.firstDuelAt || ts;
      rec.lastDuelAt = ts;
      rec.duelTs = [...(rec.duelTs || []), ts].slice(-DUEL_TS_CAP);
      if (!rec.opponents.includes(opp)) rec.opponents = [...rec.opponents, opp].slice(-OPPONENTS_CAP);
      await kvSet(`reg:${me}`, rec);
      await maybeQualify(rec);
    } catch (e) {
      console.warn('[registry] recordDuel failed', e?.message);
    }
  }
}

// ── qualification & flags ────────────────────────────────────────────
export function meetsQualification(rec) {
  return !!rec && rec.handles.length > 0 && rec.duels >= 1 && rec.opponents.some(o => o !== rec.userId);
}

/**
 * Fraud flags for one record. `ipCount` = accounts created from the same IP
 * hash in the same ISO week; `oppRecs` = map of opponent registry records.
 */
export function flagsFor(rec, { ipCount = 0, oppRecs = {}, now = Date.now() } = {}) {
  const flags = [];
  if (ipCount > IP_CLUSTER_LIMIT) flags.push('ip_cluster');
  if (rec.duels >= CLOSED_PAIR_MIN_DUELS && rec.opponents.length === 1) {
    const other = oppRecs[rec.opponents[0]];
    if (other && other.opponents.length === 1 && other.opponents[0] === rec.userId) flags.push('closed_pair');
  }
  if (!rec.handles.length && now - rec.createdAt > 7 * DAY) flags.push('no_handle_7d');
  return flags;
}

async function ipCountFor(rec) {
  if (!rec.ipHash) return 0;
  return sCard(`regip:${rec.ipHash}:${isoWeek(rec.createdAt)}`);
}

async function maybeQualify(rec) {
  if (rec.qualifiedAt || !meetsQualification(rec)) return;
  const flags = flagsFor(rec, { ipCount: await ipCountFor(rec) });
  if (flags.length) return; // flagged accounts never count
  rec.qualifiedAt = Date.now();
  await kvSet(`reg:${rec.userId}`, rec);
  const added = await sAdd('reg:qualified', rec.userId);
  auditLog('registry.qualified', { userId: rec.userId, via: rec.via, ref: rec.ref });
  if (added) {
    const total = await sCard('reg:qualified');
    if (total > 0 && total % 3 === 0) await notifyMilestone(total);
  }
}

/** Telegram ping to the founders every 3 new qualified players (best-effort). */
export async function notifyMilestone(total) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.ADMIN_TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  try {
    const text = `CLUTCH: ${total} real players qualified (fraud excluded). Weekly target: ${WEEKLY_TARGET}.`;
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text }),
    });
    return r.ok;
  } catch (e) {
    console.warn('[registry] telegram notify failed', e?.message);
    return false;
  }
}

// ── reporting ────────────────────────────────────────────────────────
function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * Pure report over registry records. `banned` = Set of banned userIds,
 * `ipCounts` = { [userId]: accounts from same IP hash that week }.
 */
export function buildReport(records, { banned = new Set(), ipCounts = {}, now = Date.now() } = {}) {
  const byId = Object.fromEntries(records.map(r => [r.userId, r]));
  const thisWeek = isoWeek(now);
  const lastWeek = isoWeek(now - 7 * DAY);

  const rows = records.map(r => {
    const flags = flagsFor(r, { ipCount: ipCounts[r.userId] || 0, oppRecs: byId, now });
    if (banned.has(r.userId)) flags.push('banned');
    const qualified = meetsQualification(r) && flags.length === 0;
    return { r, flags, qualified, qualifiedWeek: qualified ? isoWeek(r.qualifiedAt || r.firstDuelAt || r.createdAt) : null };
  });

  const createdThisWeek = rows.filter(x => isoWeek(x.r.createdAt) === thisWeek && x.r.via !== 'legacy');
  const qualifiedAll = rows.filter(x => x.qualified);
  const qualifiedThisWeek = qualifiedAll.filter(x => x.qualifiedWeek === thisWeek);
  const flagged = rows.filter(x => x.flags.length && meetsQualification(x.r));

  // Channels: by ref tag (null = direct / unknown).
  const channels = {};
  for (const x of rows) {
    if (x.r.via === 'legacy') continue;
    const k = x.r.ref || 'direct';
    channels[k] = channels[k] || { accounts: 0, qualified: 0, cluGranted: 0 };
    channels[k].accounts += 1;
    channels[k].cluGranted += STARTING_GRANT;
    if (x.qualified) channels[k].qualified += 1;
  }
  for (const c of Object.values(channels)) c.cluPerQualified = c.qualified ? Math.round(c.cluGranted / c.qualified) : null;

  // Retention: cohort = week of first duel.
  const d7Cohort = rows.filter(x => x.r.firstDuelAt && isoWeek(x.r.firstDuelAt) === lastWeek);
  const d7Returned = d7Cohort.filter(x => (x.r.duelTs || []).some(t => t > x.r.firstDuelAt && t - x.r.firstDuelAt <= 7 * DAY));
  const d30Cohort = rows.filter(x => x.r.firstDuelAt && now - x.r.firstDuelAt >= 30 * DAY && now - x.r.firstDuelAt < 37 * DAY);
  const d30Active = d30Cohort.filter(x => (x.r.duelTs || []).some(t => t - x.r.firstDuelAt >= 23 * DAY && t - x.r.firstDuelAt <= 30 * DAY));
  const lifetimes = rows.filter(x => x.r.firstDuelAt).map(x => Math.round((x.r.lastDuelAt - x.r.firstDuelAt) / DAY));

  const newAccounts = createdThisWeek.length;
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);

  return {
    week: thisWeek,
    target: WEEKLY_TARGET,
    qualifiedThisWeek: qualifiedThisWeek.length,
    qualifiedTotal: qualifiedAll.length,
    accountsTotal: records.length,
    newAccountsThisWeek: newAccounts,
    qualifyRatePct: pct(createdThisWeek.filter(x => x.qualified).length, newAccounts),
    cluPerQualifiedThisWeek: qualifiedThisWeek.length ? Math.round((newAccounts * STARTING_GRANT) / qualifiedThisWeek.length) : null,
    flaggedExcluded: flagged.length,
    flagged: flagged.map(x => ({ userId: x.r.userId, via: x.r.via, flags: x.flags })),
    channels,
    retention: {
      d7: { cohort: lastWeek, size: d7Cohort.length, returnedPct: pct(d7Returned.length, d7Cohort.length) },
      d30: { size: d30Cohort.length, activePct: pct(d30Active.length, d30Cohort.length) },
      medianLifetimeDays: median(lifetimes),
    },
  };
}

/** Load every registry record + fraud inputs and build the report. */
export async function loadReport({ isBanned } = {}) {
  const ids = await sMembers('reg:all');
  const records = (await Promise.all(ids.map(id => kvGet(`reg:${id}`)))).filter(Boolean);
  const ipCounts = {};
  const banned = new Set();
  await Promise.all(records.map(async r => {
    ipCounts[r.userId] = await ipCountFor(r);
    if (isBanned && (await isBanned(r.userId))) banned.add(r.userId);
  }));
  return buildReport(records, { banned, ipCounts });
}
