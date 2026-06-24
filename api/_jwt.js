/**
 * JWT utilities — zero-dependency, uses Node crypto
 * HS256 (HMAC-SHA256) signing and verification
 */
import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

function base64urlDecode(str) {
  return Buffer.from(str, 'base64url').toString();
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
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;
  const expected = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
  if (sig !== expected) return null;

  try {
    const payload = JSON.parse(base64urlDecode(body));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
