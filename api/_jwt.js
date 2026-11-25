/**
 * JWT utilities — zero-dependency, uses Node crypto
 * HS256 (HMAC-SHA256) signing and verification.
 *
 * The signing secret comes from JWT_SECRET (see _secrets.js for what happens when
 * it is missing on a deployment). Verification pins the algorithm to HS256,
 * compares signatures in constant time and requires an expiry.
 */
import crypto from 'crypto';
import { secretFor } from './_secrets.js';

let _secret = null;
const secret = () => (_secret ||= secretFor('JWT_SECRET', 'jwt'));

function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

function base64urlDecode(str) {
  return Buffer.from(str, 'base64url').toString();
}

function sign(data) {
  return crypto.createHmac('sha256', secret()).update(data).digest('base64url');
}

export function signJwt(payload, expiresInSec = 86400) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(JSON.stringify({
    ...payload,
    iat: now,
    exp: now + expiresInSec,
    jti: crypto.randomBytes(8).toString('hex'),
  }));
  return `${header}.${body}.${sign(`${header}.${body}`)}`;
}

export function verifyJwt(token) {
  if (!token || typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;
  const expected = Buffer.from(sign(`${header}.${body}`));
  const given = Buffer.from(String(sig));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

  try {
    const h = JSON.parse(base64urlDecode(header));
    if (!h || h.alg !== 'HS256') return null;
    const payload = JSON.parse(base64urlDecode(body));
    if (!payload || typeof payload.exp !== 'number') return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
