/**
 * POST /api/auth/metamask
 * Body: { addr, signature }
 * Verifies wallet signature using ethers.js, returns JWT
 */
import { ethers } from 'ethers';
import { kvGet, kvSet, kvDel } from '../_kv.js';
import { signJwt } from '../_jwt.js';

const STARTING_BALANCE = 500;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const addr = (body.addr || '').trim().toLowerCase();
  const signature = body.signature;

  if (!addr || !signature) {
    return res.status(400).json({ error: 'addr and signature required' });
  }

  // 1. Retrieve the nonce we issued
  const nonceData = await kvGet(`nonce:${addr}`);
  if (!nonceData || !nonceData.message) {
    return res.status(400).json({ error: 'No nonce found — request /api/auth/nonce first' });
  }

  // 2. Verify signature — ethers recovers the signer address
  let recoveredAddr;
  try {
    recoveredAddr = ethers.verifyMessage(nonceData.message, signature).toLowerCase();
  } catch (e) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (recoveredAddr !== addr) {
    return res.status(401).json({ error: 'Signature does not match address' });
  }

  // 3. Burn the nonce (one-time use)
  await kvDel(`nonce:${addr}`);

  // 4. Create or fetch user
  const userId = `user_${addr}`;
  let user = await kvGet(userId);
  if (!user) {
    user = {
      addr,
      name: addr.slice(0, 6) + '...' + addr.slice(-4),
      via: 'metamask',
      createdAt: Date.now(),
    };
    await kvSet(userId, user);
    await kvSet(`bal:${userId}`, { available: STARTING_BALANCE, escrow: 0, version: 1 });
    await kvSet(`txlog:${userId}`, []);
  }

  // 5. Issue JWT
  const token = signJwt({
    sub: userId,
    addr: user.addr,
    via: user.via,
    name: user.name,
  });

  return res.status(200).json({
    token,
    user: {
      id: userId,
      addr: user.addr,
      name: user.name,
      via: user.via,
    },
  });
}
