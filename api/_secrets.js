/**
 * Secrets and admin gates, in one place.
 *
 * requireSecret: in production a missing signing secret is a hard error (a 500
 * that names the variable), never a silent fallback: a random per-instance JWT
 * secret logs players out whenever Vercel routes them to another instance, and a
 * well-known default lets anyone forge signatures. Dev keeps a fixed fallback.
 *
 * authorizeBearer: the ADMIN_SECRET / CRON_SECRET gate shared by every
 * money-moving admin endpoint, with a constant-time comparison.
 */
import crypto from 'crypto';

export const IS_PROD =
  process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

export function requireSecret(name, devFallback) {
  const v = process.env[name];
  if (v) return v;
  if (IS_PROD) throw new Error(`SECRET_MISSING: set ${name} in the Vercel environment`);
  return devFallback;
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Gate a request on `Authorization: Bearer <process.env[envName]>`. Sends the
 * error response and returns false when refused. With the variable unset it
 * refuses in production and allows in local dev.
 */
export function authorizeBearer(req, res, envName = 'ADMIN_SECRET', what = 'Admin endpoint') {
  const secret = process.env[envName];
  if (!secret) {
    if (IS_PROD) {
      res.status(503).json({ error: `${what} not configured (${envName} unset)` });
      return false;
    }
    return true; // dev convenience
  }
  if (!safeEqual(req.headers.authorization || '', `Bearer ${secret}`)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}
