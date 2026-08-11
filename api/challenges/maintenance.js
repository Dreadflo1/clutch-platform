/**
 * GET /api/challenges/maintenance  (Vercel Cron)
 *
 * Sweeps for challenges whose escrow would otherwise be trapped and refunds it:
 *   - open + past expiresAt        → cancel, refund creator
 *   - accepted + past settleDeadline → draw, refund both players
 *
 * Money-moving, so it is gated by CRON_SECRET. Vercel Cron sends
 * `Authorization: Bearer <CRON_SECRET>` automatically when that env var is set.
 * In local dev (no CRON_SECRET) it is allowed so the sweep can be exercised.
 */
import { kvGet, kvLock, kvUnlock } from '../_kv.js';
import { getOpenList, getActiveList, cancelOpen, refundDraw } from '../_challenges.js';

const IS_PROD =
  process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

function authorize(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Never leave a money-moving sweep open in production.
    if (IS_PROD) {
      res.status(503).json({ error: 'Maintenance sweep not configured (CRON_SECRET unset)' });
      return false;
    }
    return true; // dev convenience
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!authorize(req, res)) return;

  const now = Date.now();
  const result = { cancelled: 0, refunded: 0, scannedOpen: 0, scannedActive: 0, errors: 0 };

  // ── Expired open challenges → cancel + refund creator ──
  const open = await getOpenList();
  result.scannedOpen = open.length;
  for (const item of open) {
    if (item.status !== 'open' || item.expiresAt > now) continue;
    const lockKey = `lock:accept:${item.id}`;
    if (!(await kvLock(lockKey, 10))) continue;
    try {
      const ch = await kvGet(`ch:${item.id}`);
      if (ch && ch.status === 'open' && ch.expiresAt <= now) {
        if ((await cancelOpen(ch, 'expired')) === 'cancelled') result.cancelled++;
      }
    } catch { result.errors++; } finally {
      await kvUnlock(lockKey);
    }
  }

  // ── Timed-out accepted challenges → draw + refund both ──
  const active = await getActiveList();
  result.scannedActive = active.length;
  for (const id of active) {
    const lockKey = `lock:settle:${id}`;
    if (!(await kvLock(lockKey, 15))) continue;
    try {
      const ch = await kvGet(`ch:${id}`);
      if (ch && ch.settleDeadline && ch.settleDeadline < now) {
        if ((await refundDraw(ch, 'timeout')) === 'refunded') result.refunded++;
      }
    } catch { result.errors++; } finally {
      await kvUnlock(lockKey);
    }
  }

  return res.status(200).json({ ok: true, sweptAt: new Date(now).toISOString(), ...result });
}
