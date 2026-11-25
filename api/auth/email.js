/**
 * POST /api/auth/email
 * Body: { mode: 'signup' | 'login', email, password, name?, dob?, website? }
 *
 * Non-crypto account path so players without a wallet can sign in and fund with
 * a card (Stripe). Passwords are hashed with scrypt (built-in crypto, no deps)
 * and never stored in plaintext. Issues the SAME JWT as the wallet path, so
 * email accounts get a balance, escrow, duels and payouts identically.
 *
 * Abuse controls:
 *  - per-IP cap on every call, plus a per-IP cap on new accounts per hour;
 *  - per-account counter of FAILED logins (atomic), then a cooldown;
 *  - `website` is a honeypot field hidden from people: bots that fill every
 *    input are refused.
 * The email is stored encrypted (see _crypto.js); the account id is a hash of it.
 */
import crypto from 'crypto';
import { promisify } from 'util';
import { kvGet, kvSet, kvSetNx } from '../_kv.js';
import { registerAccount } from '../_registry.js';
import { signJwt } from '../_jwt.js';
import { ageFromDob, confirmAge, MIN_AGE } from '../_age.js';
import { limit, hit, peekHits, clearHits, clientIp } from '../_ratelimit.js';
import { readJson, cleanDisplayName } from '../_sanitize.js';
import { sealField } from '../_crypto.js';
import { securityLog } from '../_log.js';

const scrypt = promisify(crypto.scrypt);

const STARTING_BALANCE = 500;
const MAX_ATTEMPTS = 8;          // failed logins per account before a cooldown
const ATTEMPT_WINDOW = 600;      // seconds
const SIGNUPS_PER_IP_HOUR = 5;   // new email accounts per IP per hour

// scrypt cost. Hashes record their own N so older ones (N=16384) still verify
// and are upgraded on the next successful login.
const SCRYPT_N = 32768;
const LEGACY_N = 16384;

const normEmail = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
const validEmail = (e) => e.length <= 254 && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(e);

async function hashPassword(password, salt, N = SCRYPT_N) {
  const buf = await scrypt(password, salt, 64, { N, r: 8, p: 1, maxmem: 128 * N * 8 * 2 });
  return buf.toString('hex');
}
function safeEqualHex(a, b) {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
function idFor(email) {
  return 'user_email_' + crypto.createHash('sha256').update(email).digest('hex').slice(0, 24);
}
// A fixed dummy so unknown emails cost the same scrypt time as real ones.
const DUMMY = { salt: '00000000000000000000000000000000', hash: '00'.repeat(64), N: SCRYPT_N };

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Per-IP cap (complements the per-account throttle below): blunts signup spam
  // and password spraying spread across many accounts from one host.
  if (!(await limit(req, res, 'auth', { limit: 20, windowSec: 60 }))) return;

  const body = readJson(req);
  if (!body) return res.status(400).json({ error: 'Invalid request.' });
  const mode = body.mode === 'signup' ? 'signup' : 'login';
  const email = normEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';

  // Honeypot: the field is invisible to people, so only bots fill it.
  if (body.website) {
    securityLog('bot_honeypot', { route: 'auth/email', ip: clientIp(req) });
    return res.status(400).json({ error: 'Sign-up failed. Reload the page and try again.' });
  }

  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (password.length > 256) return res.status(400).json({ error: 'Password is too long (256 characters max).' });

  const userId = idFor(email);
  const credKey = `cred:${userId}`;

  // Per-account throttle on failed logins (blunts password guessing).
  const throttleKey = `auththrottle:${userId}`;
  if ((await peekHits(throttleKey)) >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many attempts — wait a few minutes and try again.' });
  }

  if (mode === 'signup') {
    // Age gate; DOB verified.
    const age = ageFromDob(body.dob);
    if (age === null) return res.status(400).json({ error: 'Enter a valid date of birth.' });
    if (age < MIN_AGE) return res.status(403).json({ error: `You must be at least ${MIN_AGE} to sign up for CLUTCH.`, code: 'under_min' });

    // Bot protection: a few new accounts per IP per hour is plenty for people.
    if (!(await limit(req, res, 'signup', { limit: SIGNUPS_PER_IP_HOUR, windowSec: 3600 }))) return;

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await hashPassword(password, salt);
    // Atomic create: fails (returns false) if the account already exists — no race.
    const created = await kvSetNx(credKey, { salt, hash, N: SCRYPT_N, email: sealField(email), createdAt: Date.now() });
    if (!created) {
      return res.status(409).json({ error: 'An account with this email already exists — sign in instead.' });
    }
    const name = cleanDisplayName(body.name, cleanDisplayName(email.split('@')[0]), 22);
    const user = { addr: null, email: sealField(email), name, via: 'email', createdAt: Date.now() };
    await kvSet(userId, user);
    await kvSet(`bal:${userId}`, { available: STARTING_BALANCE, escrow: 0, version: 1 });
    await kvSet(`txlog:${userId}`, []);
    await confirmAge(userId, body.dob); // record the age confirmation
    await registerAccount(userId, { via: 'email', req, ref: body.ref });

    const token = signJwt({ sub: userId, addr: null, via: 'email', name });
    return res.status(200).json({ token, user: { id: userId, addr: null, name, via: 'email' } });
  }

  // login
  const cred = await kvGet(credKey);
  const use = cred || DUMMY;
  const N = use.N || LEGACY_N;
  const hash = await hashPassword(password, use.salt, N);
  const okPw = Boolean(cred) && safeEqualHex(hash, use.hash);
  if (!okPw) {
    await hit(throttleKey, ATTEMPT_WINDOW);
    securityLog('auth_fail', { via: 'email', user: userId, ip: clientIp(req) });
    // Same message whether the email is unknown or the password is wrong.
    return res.status(401).json({ error: 'Wrong email or password.' });
  }
  await clearHits(throttleKey); // reset throttle on success

  // Upgrade older hashes / plaintext emails in place.
  if (N !== SCRYPT_N || !String(cred.email || '').startsWith('enc:')) {
    const salt = crypto.randomBytes(16).toString('hex');
    await kvSet(credKey, { ...cred, salt, hash: await hashPassword(password, salt), N: SCRYPT_N, email: sealField(email) });
  }

  const user = (await kvGet(userId)) || { addr: null, name: cleanDisplayName(email.split('@')[0]), via: 'email' };
  if (user.email && !String(user.email).startsWith('enc:')) {
    await kvSet(userId, { ...user, email: sealField(user.email) });
  }
  const token = signJwt({ sub: userId, addr: null, via: 'email', name: user.name });
  return res.status(200).json({ token, user: { id: userId, addr: null, name: user.name, via: 'email' } });
}
