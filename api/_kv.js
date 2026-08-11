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
export async function kvGet(key) {
  assertConfigured();
  if (!kvActive()) return memGetSync(key);
  try {
    const result = await kvCommand(['GET', key]);
    return result ? JSON.parse(result) : null;
  } catch {
    return null;
  }
}

export async function kvSet(key, value, exSeconds) {
  assertConfigured();
  const json = JSON.stringify(value);
  if (!kvActive()) return memSetSync(key, value, exSeconds);
  try {
    const cmd = exSeconds ? ['SET', key, json, 'EX', exSeconds] : ['SET', key, json];
    const result = await kvCommand(cmd);
    return result === 'OK';
  } catch {
    return false;
  }
}

export async function kvDel(key) {
  assertConfigured();
  if (!kvActive()) {
    memStore.delete(key);
    memExpiry.delete(key);
    return true;
  }
  try {
    await kvCommand(['DEL', key]);
    return true;
  } catch {
    return false;
  }
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
  return kvDel(key);
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
