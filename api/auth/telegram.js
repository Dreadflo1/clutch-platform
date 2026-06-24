/**
 * POST /api/auth/telegram
 * Body: { id, first_name, username, auth_date, hash, ... }
 * Verifies Telegram Login Widget hash, returns JWT
 */
import crypto from 'crypto';
import { kvGet, kvSet } from '../_kv.js';
import { signJwt } from '../_jwt.js';

const STARTING_BALANCE = 500;

function verifyTelegramAuth(data) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;

  const hash = data.hash;
  if (!hash) return false;

  // Build check string: sorted key=value pairs (excluding hash)
  const checkArr = Object.keys(data)
    .filter(k => k !== 'hash')
    .sort()
    .map(k => `${k}=${data[k]}`);
  const checkString = checkArr.join('\n');

  // Secret key = SHA256 of bot token
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

  if (hmac !== hash) return false;

  // Check auth_date is not older than 1 hour
  const authDate = parseInt(data.auth_date);
  if (Date.now() / 1000 - authDate > 3600) return false;

  return true;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  if (!body.id || !body.hash) {
    return res.status(400).json({ error: 'Telegram auth data required' });
  }

  // Verify Telegram hash
  if (!verifyTelegramAuth(body)) {
    return res.status(401).json({ error: 'Invalid Telegram auth — hash mismatch or expired' });
  }

  // Create or fetch user
  const tgId = String(body.id);
  const userId = `user_tg_${tgId}`;
  let user = await kvGet(userId);
  if (!user) {
    user = {
      addr: `tg_${tgId}`,
      name: body.username ? `@${body.username}` : body.first_name || `TG_${tgId}`,
      via: 'telegram',
      telegramId: tgId,
      createdAt: Date.now(),
    };
    await kvSet(userId, user);
    await kvSet(`bal:${userId}`, { available: STARTING_BALANCE, escrow: 0, version: 1 });
    await kvSet(`txlog:${userId}`, []);
  }

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
