/**
 * Field-level encryption for personal data at rest (emails, dates of birth).
 *
 * AES-256-GCM with a random 96-bit IV per value; output is
 * "enc:v1:<iv>.<tag>.<ciphertext>" (base64url). The key is DATA_ENCRYPTION_KEY
 * (any long random string; it is hashed to 32 bytes). On a deployment without it
 * we derive one from the JWT secret chain in _secrets.js, so data is never left
 * in plaintext, and a warning is logged so a dedicated key gets set.
 *
 * openField() accepts legacy plaintext values unchanged, so records written
 * before this module existed keep working.
 */
import crypto from 'crypto';
import { secretFor } from './_secrets.js';

const PREFIX = 'enc:v1:';
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
let _keys = null;
/** [sealing key, ...older keys still accepted for reading]. */
function keys() {
  if (_keys) return _keys;
  const list = [sha(secretFor('DATA_ENCRYPTION_KEY', 'data-encryption'))];
  // Once DATA_ENCRYPTION_KEY is set, values sealed earlier with the derived
  // fallback key stay readable.
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (process.env.DATA_ENCRYPTION_KEY && kvToken) {
    list.push(sha(crypto.createHmac('sha256', kvToken).update('clutch:data-encryption').digest('hex')));
  }
  return (_keys = list);
}
const key = () => keys()[0];

export function isSealed(v) {
  return typeof v === 'string' && v.startsWith(PREFIX);
}

export function sealField(value) {
  if (value === null || value === undefined || value === '') return value;
  if (isSealed(value)) return value;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(String(value), 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return PREFIX + [iv, tag, ct].map((b) => b.toString('base64url')).join('.');
}

export function openField(value) {
  if (!isSealed(value)) return value; // legacy plaintext or empty
  const [iv, tag, ct] = value.slice(PREFIX.length).split('.').map((s) => Buffer.from(s, 'base64url'));
  for (const k of keys()) {
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', k, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
    } catch { /* try the next key */ }
  }
  return null; // no key fits, or the value was tampered with
}

/** Test hook: forget cached keys after changing env vars. */
export function _resetKeys() { _keys = null; }
