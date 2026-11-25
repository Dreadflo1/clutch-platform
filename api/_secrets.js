/**
 * Secrets and admin gates, in one place.
 *
 * IS_DEPLOYED is true on every Vercel deployment (production AND preview). Gates
 * that would otherwise "allow in dev" must fail closed on previews too: a preview
 * URL is public and may be wired to the same database as production.
 *
 * secretFor(name, label): the signing secret from the environment. When it is
 * missing on a deployment we never fall back to a well-known string (anyone could
 * forge signatures) nor to a random per-instance value (players get logged out
 * whenever Vercel routes them to another instance). Instead we derive a stable
 * secret from the database token, which is itself secret and shared by every
 * instance, and log a loud warning so the variable gets set.
 *
 * authorizeBearer: the ADMIN_SECRET / CRON_SECRET gate shared by every admin and
 * cron endpoint: constant-time comparison, fail-closed on deployments, and a
 * per-IP cap on failed attempts so the secret cannot be brute-forced.
 */
import crypto from 'crypto';
import { securityLog } from './_log.js';

export const IS_PROD =
  process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
export const IS_DEPLOYED = IS_PROD || process.env.VERCEL_ENV === 'preview';

const warned = new Set();
const devSecrets = new Map();

export function secretFor(name, label = name) {
  const v = process.env[name];
  if (v) return v;
  if (IS_DEPLOYED) {
    const base = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!base) throw new Error(`SECRET_MISSING: set ${name} in the Vercel environment`);
    if (!warned.has(name)) {
      warned.add(name);
      securityLog('secret_missing', { name, fallback: 'derived_from_kv_token' });
    }
    return crypto.createHmac('sha256', base).update('clutch:' + label).digest('hex');
  }
  // Local dev: random per process, never a constant that could leak to prod.
  if (!devSecrets.has(name)) devSecrets.set(name, crypto.randomBytes(32).toString('hex'));
  return devSecrets.get(name);
}

export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Gate a request on `Authorization: Bearer <process.env[envName]>`. Sends the
 * error response and returns false when refused. With the variable unset it
 * refuses on any deployment and allows only in local dev.
 */
export async function authorizeBearer(req, res, envName = 'ADMIN_SECRET', what = 'Admin endpoint') {
  const secret = process.env[envName];
  if (!secret) {
    if (IS_DEPLOYED) {
      res.status(503).json({ error: `${what} not configured (${envName} unset)` });
      return false;
    }
    return true; // local dev convenience
  }
  // Lazy import keeps this module free of a KV dependency for pure helpers.
  const { limit, clientIp } = await import('./_ratelimit.js');
  if (!safeEqual(req.headers.authorization || '', `Bearer ${secret}`)) {
    securityLog('admin_auth_fail', { envName, ip: clientIp(req) });
    // Count failures only: 10 wrong secrets per IP per 10 minutes, then 429.
    if (!(await limit(req, res, 'adminfail', { limit: 10, windowSec: 600 }))) return false;
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}
