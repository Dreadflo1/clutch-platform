/**
 * GET /api/auth/nonce?addr=0x...
 * Returns a nonce message for the wallet to sign
 */
import crypto from 'crypto';
import { kvSet } from '../_kv.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const addr = (req.query.addr || '').trim().toLowerCase();
  if (!addr || addr.length < 10 || !/^0x[a-f0-9]{40}$/i.test(addr)) {
    return res.status(400).json({ error: 'Valid Ethereum address required' });
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const message = `Sign this to log in to CLUTCH:\n\nNonce: ${nonce}\nAddress: ${addr}\nTimestamp: ${new Date().toISOString()}`;

  await kvSet(`nonce:${addr}`, { nonce, message, createdAt: Date.now() }, 300);

  return res.status(200).json({ nonce, message });
}
