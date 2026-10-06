/**
 * Vercel KV (Upstash Redis REST) wrapper — shared across all API endpoints.
 *
 * In production KV env vars are REQUIRED: if they are missing we throw instead of
 * silently falling back to an in-memory store (a silent fallback loses every
 * balance on the next cold start — real money must never live in process memory).
 *
 * In local dev (no VERCEL_ENV / NODE_ENV=production) we fall back to an in-memory
 * Map so the API can be exercised without provisioning KV.
 */

const memStore = new Map();
const memExpiry = new Map();

const IS_PROD =
  process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

function creds() {
  // Accept either naming convention: Vercel KV (KV_REST_API_*) or the Upstash
  // Marketplace integration (UPSTASH_REDIS_REST_*). Both speak the same REST API,
  // so whichever the connected store injects, we pick it up.
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

/** True when a real KV backend is configured. */
export function kvActive() {
  const { url, token } = creds();
  return Boolean(url && token);
}

function assertConfigured() {
  if (!kvActive() && IS_PROD) {
    throw new Error(
      'KV_MISCONFIGURED: no KV credentials in production. Connect an Upstash Redis / ' +
        'Vercel KV store so KV_REST_API_URL/TOKEN (or UPSTASH_REDIS_REST_URL/TOKEN) are set.'
    );
  }
}

/** Low-level: run a single Redis command over the Upstash REST API. */
async function kvCommand(command) {
  const { url, token } = creds();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err = new Error(data.error || `KV command failed (${res.status})`);
    err.kvError = data.error || `HTTP ${res.status}`;
    throw err;
  }
  return data.result;
}

// ── In-memory helpers (dev only) ────────────────────────────────
function memExpired(key) {
  const exp = memExpiry.get(key);
  if (exp && exp < Date.now()) {
    memStore.delete(key);
    memExpiry.delete(key);
    return true;
  }
  return false;
}

/** Synchronous parsed read from the in-memory store (dev fallback only). */
export function memGetSync(key) {
  if (memExpired(key)) return null;
  const val = memStore.get(key);
  return val ? JSON.parse(val) : null;
}

/** Synchronous write to the in-memory store (dev fallback only). */
export function memSetSync(key, value, exSeconds) {
  memStore.set(key, JSON.stringify(value));
  if (exSeconds) memExpiry.set(key, Date.now() + exSeconds * 1000);
  else memExpiry.delete(key);
  return true;
}

// ── Public API ──────────────────────────────────────────────────
// Reads and writes THROW on a KV transport error instead of returning null /
// false. A swallowed error is indistinguishable from "key absent", and callers
// act on absence: a login that reads null for an existing user would re-create
// it and reset its balance. Failing the request (500) is always the safer path.
function parse(result) {
  if (result === null || result === undefined) return null;
  try { return JSON.parse(result); } catch { return result; }
}

export async function kvGet(key) {
  assertConfigured();
  if (!kvActive()) return memGetSync(key);
  return parse(await kvCommand(['GET', key]));
}

export async function kvSet(key, value, exSeconds) {
  assertConfigured();
  const json = JSON.stringify(value);
  if (!kvActive()) return memSetSync(key, value, exSeconds);
  const cmd = exSeconds ? ['SET', key, json, 'EX', exSeconds] : ['SET', key, json];
  return (await kvCommand(cmd)) === 'OK';
}

export async function kvDel(key) {
  assertConfigured();
  if (!kvActive()) {
    memStore.delete(key);
    memExpiry.delete(key);
    return true;
  }
  await kvCommand(['DEL', key]);
  return true;
}

/** Atomically add `by` to an integer counter (created at 0). Returns the new value. */
export async function kvIncrBy(key, by) {
  assertConfigured();
  if (!kvActive()) {
    const n = (Number(memGetSync(key)) || 0) + by;
    memSetSync(key, n);
    return n;
  }
  return Number(await kvCommand(['INCRBY', key, String(by)]));
}

// ── Atomic JSON-array updates ───────────────────────────────────
// Lists such as the open board, the active list and per-user tx logs are stored
// as one JSON array. A plain read-modify-write loses entries when two requests
// update the same list at once (two players posting duels: one vanishes from the
// board). These run the whole update inside one Lua EVAL.
// Items are matched by `idField` when they are objects, by value otherwise.
const LIST_LUA = `
local raw = redis.call('GET', KEYS[1])
local list = {}
if raw then list = cjson.decode(raw) end
local op, payload, idField, max, ttl = ARGV[1], ARGV[2], ARGV[3], tonumber(ARGV[4]), tonumber(ARGV[5])
local function idOf(v) if type(v) == 'table' and idField ~= '' then return v[idField] end return v end
local out = {}
local target
if op == 'push' then target = cjson.decode(payload) else target = payload end
local targetId = op == 'push' and idOf(target) or target
if op == 'push' then table.insert(out, target) end
local changed = op == 'push'
for i = 1, #list do
  local v = list[i]
  if tostring(idOf(v)) == tostring(targetId) then changed = true
  elseif max <= 0 or #out < max then table.insert(out, v) end
end
if op == 'push' and max > 0 then while #out > max do table.remove(out) end end
if not changed then return 0 end
local enc = '[]'
if #out > 0 then enc = cjson.encode(out) end
if ttl > 0 then redis.call('SET', KEYS[1], enc, 'EX', ttl) else redis.call('SET', KEYS[1], enc) end
return 1
`;

function memListUpdate(key, op, item, { idField = '', max = 0, ttl = 0 } = {}) {
  const idOf = v => (v && typeof v === 'object' && idField ? v[idField] : v);
  const list = memGetSync(key) || [];
  const targetId = op === 'push' ? idOf(item) : item;
  const rest = list.filter(v => String(idOf(v)) !== String(targetId));
  if (op === 'remove' && rest.length === list.length) return 0;
  let out = op === 'push' ? [item, ...rest] : rest;
  if (max > 0) out = out.slice(0, max);
  memSetSync(key, out, ttl || undefined);
  return 1;
}

/** Put `item` at the front of the JSON array at `key` (replacing any entry with the same id). */
export async function kvListPush(key, item, opts = {}) {
  assertConfigured();
  if (!kvActive()) return memListUpdate(key, 'push', item, opts);
  const { idField = '', max = 0, ttl = 0 } = opts;
  return kvEval(LIST_LUA, [key], ['push', JSON.stringify(item), idField, String(max), String(ttl)]);
}

/** Remove the entry whose id (or value) is `id` from the JSON array at `key`. */
export async function kvListRemove(key, id, opts = {}) {
  assertConfigured();
  if (!kvActive()) return memListUpdate(key, 'remove', id, opts);
  const { idField = '', ttl = 0 } = opts;
  return kvEval(LIST_LUA, [key], ['remove', String(id), idField, '0', String(ttl)]);
}

/**
 * Acquire a short-lived lock. Returns true if acquired, false if already held.
 * Uses atomic SET NX EX so two concurrent callers can never both win.
 */
export async function kvLock(key, ttlSeconds = 10) {
  assertConfigured();
  if (!kvActive()) {
    if (memGetSync(key)) return false;
    memSetSync(key, 1, ttlSeconds);
    return true;
  }
  const result = await kvCommand(['SET', key, '1', 'NX', 'EX', ttlSeconds]);
  return result === 'OK';
}

export async function kvUnlock(key) {
  // Locks carry a TTL, so a failed release only delays the next holder; never
  // let it mask the real outcome of the request that held it.
  try { return await kvDel(key); } catch { return false; }
}

/**
 * Set a key only if it does not already exist, with NO expiry (permanent).
 * Returns true if this call created it, false if it was already present.
 * The durable building block for exactly-once effects (e.g. crediting a
 * payment): the marker must outlive any TTL so a payment can never re-credit.
 */
export async function kvSetNx(key, value) {
  assertConfigured();
  const json = JSON.stringify(value);
  if (!kvActive()) {
    if (memGetSync(key) !== null) return false;
    memSetSync(key, value);
    return true;
  }
  const result = await kvCommand(['SET', key, json, 'NX']);
  return result === 'OK';
}

/**
 * Run a Lua script atomically. `keys` and `args` are string arrays.
 * Returns the raw script result. KV backend required (throws in dev if no KV).
 */
export async function kvEval(script, keys = [], args = []) {
  assertConfigured();
  if (!kvActive()) {
    throw new Error('kvEval requires a KV backend (no in-memory emulation)');
  }
  return kvCommand(['EVAL', script, String(keys.length), ...keys, ...args]);
}
