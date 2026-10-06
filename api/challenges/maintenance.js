/**
 * GET /api/challenges/maintenance  (Vercel Cron)
 *
 * Sweeps for challenges whose escrow would otherwise be trapped and refunds it:
 *   - open + past expiresAt        → cancel, refund creator
 *   - accepted + past settleDeadline → draw, refund both players
 *   - disputed + unreviewed for DISPUTE_REVIEW_MS → draw, refund both players
 *     (disputes wait for an admin ruling first; they are not no-shows)
 *
 * Money-moving, so it is gated by CRON_SECRET. Vercel Cron sends
 * `Authorization: Bearer <CRON_SECRET>` automatically when that env var is set.
 * In local dev (no CRON_SECRET) it is allowed so the sweep can be exercised.
 */
import { authorizeBearer } from '../_secrets.js';
import { kvGet, kvLock, kvUnlock } from '../_kv.js';
import { getOpenList, getActiveList, cancelOpen, refundDraw } from '../_challenges.js';

// How long a disputed duel waits for an admin ruling before it is unwound as a
// draw, so a dispute nobody reviews can never trap both players' entries.
export const DISPUTE_REVIEW_MS = 7 * 24 * 3600 * 1000;

const authorize = (req, res) => authorizeBearer(req, res, 'CRON_SECRET', 'Maintenance sweep');

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
      if (!ch) continue;
      if (ch.status === 'disputed') {
        // Before this, a dispute was auto-drawn as a "no-show" 24h after
        // acceptance, often before an admin could rule on it.
        if ((ch.disputedAt || 0) + DISPUTE_REVIEW_MS < now) {
          if ((await refundDraw(ch, 'dispute_unreviewed')) === 'refunded') result.refunded++;
        }
      } else if (ch.settleDeadline && ch.settleDeadline < now) {
        if ((await refundDraw(ch, 'timeout')) === 'refunded') result.refunded++;
      }
    } catch { result.errors++; } finally {
      await kvUnlock(lockKey);
    }
  }

  return res.status(200).json({ ok: true, sweptAt: new Date(now).toISOString(), ...result });
}
