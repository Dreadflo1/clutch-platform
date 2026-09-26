/**
 * POST /api/auth/email
 * Body: { mode: 'signup' | 'login', email, password, name? }
 *
 * Non-crypto account path so players without a wallet can sign in and fund with
 * a card (Stripe). Passwords are hashed with scrypt (built-in crypto, no deps)
 * and never stored in plaintext. Issues the SAME JWT as the wallet path, so
 * email accounts get a balance, escrow, duels and payouts identically.
 */
import crypto from 'crypto';
import { kvGet, kvSet, kvSetNx } from '../_kv.js';
import { signJwt } from '../_jwt.js';

const STARTING_BALANCE = 500;
const MAX_ATTEMPTS = 8;          // per-account login attempts before a cooldown
const ATTEMPT_WINDOW = 600;      // seconds

const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
function safeEqualHex(a, b) {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
function idFor(email) {
  return 'user_email_' + crypto.createHash('sha256').update(email).digest('hex').slice(0, 24);
}
function cleanName(name, fallback) {
  const n = String(name || '').trim().replace(/[<>"']/g, '').slice(0, 22);
  return n || fallback;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const mode = body.mode === 'signup' ? 'signup' : 'login';
  const email = normEmail(body.email);
  const password = String(body.password || '');

  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const userId = idFor(email);
  const credKey = `cred:${userId}`;

  // Per-account throttle (blunts password guessing).
  const throttleKey = `auththrottle:${userId}`;
  const attempts = (await kvGet(throttleKey)) || 0;
  if (attempts >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many attempts — wait a few minutes and try again.' });
  }

  if (mode === 'signup') {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    // Atomic create: fails (returns false) if the account already exists — no race.
    const created = await kvSetNx(credKey, { salt, hash, email, createdAt: Date.now() });
    if (!created) {
      return res.status(409).json({ error: 'An account with this email already exists — sign in instead.' });
    }
    const name = cleanName(body.name, email.split('@')[0]);
    const user = { addr: null, email, name, via: 'email', createdAt: Date.now() };
    await kvSet(userId, user);
    await kvSet(`bal:${userId}`, { available: STARTING_BALANCE, escrow: 0, version: 1 });
    await kvSet(`txlog:${userId}`, []);

    const token = signJwt({ sub: userId, addr: null, via: 'email', name });
    return res.status(200).json({ token, user: { id: userId, addr: null, name, via: 'email' } });
  }

  // login
  const cred = await kvGet(credKey);
  const hash = cred ? hashPassword(password, cred.salt) : null;
  const okPw = cred && safeEqualHex(hash, cred.hash);
  if (!okPw) {
    await kvSet(throttleKey, attempts + 1, ATTEMPT_WINDOW);
    // Same message whether the email is unknown or the password is wrong.
    return res.status(401).json({ error: 'Wrong email or password.' });
  }
  await kvSet(throttleKey, 0, 1); // reset throttle on success

  const user = (await kvGet(userId)) || { addr: null, email, name: email.split('@')[0], via: 'email' };
  const token = signJwt({ sub: userId, addr: null, via: 'email', name: user.name });
  return res.status(200).json({ token, user: { id: userId, addr: null, name: user.name, via: 'email' } });
}
