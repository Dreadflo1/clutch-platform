/**
 * Shared rate limiter — durable across serverless instances.
 *
 * Vercel spins up many isolated function instances, each with its own memory, so
 * an in-memory counter (see the old, never-wired api/_middleware.js) barely slows
 * an attacker down. This limiter counts in KV (Upstash Redis) with an atomic
 * INCR + first-hit EXPIRE, so one shared window covers every instance.
 *
 * Design choices:
 *  - FAIL-OPEN: if KV errors, we allow the request. A rate limiter must never be
 *    the thing that takes the whole API down during a KV blip.
 *  - Per-IP by default, with an optional per-target `id` (email / address) so a
 *    brute-forcer can't spread guesses for ONE account across many IPs.
 *  - Dev (no KV) falls back to an in-memory window — fine for local testing.
 */
import { kvActive, kvEval, memGetSync, memSetSync } from './_kv.js';
import { securityLog } from './_log.js';

export function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return (xff && String(xff).split(',')[0].trim())
    || req.headers['x-real-ip']
    || (req.socket && req.socket.remoteAddress)
    || 'unknown';
}

// INCR the counter; on the first hit of a fresh window, set its TTL. Returns the
// running count so the caller can compare against the limit.
const LUA_INCR = "local c = redis.call('INCR', KEYS[1]) if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end return c";

async function hit(key, windowSec) {
  if (kvActive()) {
    try {
      const c = await kvEval(LUA_INCR, [key], [String(windowSec)]);
      return Number(c) || 0;
    } catch {
      return 0; // fail-open — never lock users out on an infra error
    }
  }
  // Dev fallback: coarse in-memory window (non-atomic, single instance).
  const now = Date.now();
  const rec = memGetSync(key);
  if (!rec || rec.reset < now) { memSetSync(key, { n: 1, reset: now + windowSec * 1000 }, windowSec); return 1; }
  rec.n += 1;
  memSetSync(key, rec, Math.max(1, Math.ceil((rec.reset - now) / 1000)));
  return rec.n;
}

/**
 * Enforce a limit. On breach sends 429 and returns false; otherwise returns true
 * and the caller proceeds.
 *
 * @param {object} req, res
 * @param {string} bucket   logical route name, e.g. 'auth', 'settle', 'withdraw'
 * @param {object} opts     { limit=30, windowSec=60, id? }
 *                          id = extra dimension (email/addr) for per-target limits
 */
export async function limit(req, res, bucket, opts = {}) {
  const max = opts.limit || 30;
  const windowSec = opts.windowSec || 60;
  const ip = clientIp(req);
  const idPart = opts.id ? ':' + String(opts.id).slice(0, 64) : '';
  const key = `rl:${bucket}:${ip}${idPart}`;
  const count = await hit(key, windowSec);
  if (count > max) {
    securityLog('rate_limit', { bucket, ip, id: opts.id || null, count, max });
    res.status(429).json({ error: 'Too many requests — slow down and try again shortly.', retryAfter: windowSec });
    return false;
  }
  return true;
}
