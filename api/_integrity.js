/**
 * Dispute tracking + auto-ban — server-authoritative (a client-side ban is
 * trivially bypassed by clearing localStorage, so enforcement lives here).
 *
 * Fair-ban model (two signals):
 *
 *  1. Provisional disputes (`disputes:{userId}`): every duel that ends in a
 *     dispute counts against BOTH players — at dispute time we don't yet know
 *     who mis-reported. A run of these auto-bans at DISPUTE_BAN_THRESHOLD so a
 *     serial disputer can't keep trapping opponents while review is pending.
 *
 *  2. Confirmed faults (`faults:{userId}`): when an admin resolves a disputed
 *     duel (see api/challenges/resolve.js), the loser of that ruling is the one
 *     who actually mis-reported — they get a confirmed fault, and the honest
 *     winner is EXONERATED (their provisional strike from this duel is removed,
 *     lifting a dispute-only ban if it drops them back under the line). Confirmed
 *     faults ban faster (FAULT_BAN_THRESHOLD) because a human verified them.
 *
 * Net effect: an honest player repeatedly matched with liars is cleared on
 * review and never banned for others' cheating; only the actual cheat accrues
 * toward a durable ban.
 */
import { kvGet, kvSet, kvDel } from './_kv.js';

// Provisional threshold is deliberately a touch higher than the old value of 2,
// so a couple of unlucky matchups don't insta-ban before an admin can review.
export const DISPUTE_BAN_THRESHOLD = parseInt(process.env.DISPUTE_BAN_THRESHOLD) || 3;
export const FAULT_BAN_THRESHOLD = parseInt(process.env.FAULT_BAN_THRESHOLD) || 2;

/** Increment a user's provisional dispute count; ban them if they hit the threshold. */
export async function recordDispute(userId) {
  if (!userId) return 0;
  const key = `disputes:${userId}`;
  const count = ((await kvGet(key)) || 0) + 1;
  await kvSet(key, count);
  if (count >= DISPUTE_BAN_THRESHOLD) {
    await kvSet(`banned:${userId}`, { at: Date.now(), reason: 'disputes', disputes: count });
  }
  return count;
}

/** Count a dispute against both sides of a challenge. */
export async function recordDisputeBoth(ch) {
  const [c, o] = await Promise.all([recordDispute(ch.creatorUserId), recordDispute(ch.opponentUserId)]);
  return { creator: c, opponent: o };
}

/**
 * Confirm a fault against the player an admin ruled had mis-reported. Bans at
 * FAULT_BAN_THRESHOLD (reason 'faults' — a durable ban, never lifted by an
 * exoneration on some other duel).
 */
export async function recordFault(userId) {
  if (!userId) return 0;
  const key = `faults:${userId}`;
  const count = ((await kvGet(key)) || 0) + 1;
  await kvSet(key, count);
  if (count >= FAULT_BAN_THRESHOLD) {
    await kvSet(`banned:${userId}`, { at: Date.now(), reason: 'faults', faults: count });
  }
  return count;
}

/**
 * Exonerate the honest side of a reviewed dispute: remove one provisional
 * strike, and lift a dispute-only ban if they now sit under both thresholds.
 * A confirmed-fault ban is left untouched.
 */
export async function clearDispute(userId) {
  if (!userId) return 0;
  const key = `disputes:${userId}`;
  const count = Math.max(0, ((await kvGet(key)) || 0) - 1);
  await kvSet(key, count);
  const ban = await kvGet(`banned:${userId}`);
  if (ban && ban.reason === 'disputes') {
    const faults = (await kvGet(`faults:${userId}`)) || 0;
    if (count < DISPUTE_BAN_THRESHOLD && faults < FAULT_BAN_THRESHOLD) {
      await kvDel(`banned:${userId}`);
    }
  }
  return count;
}

/**
 * Apply an admin ruling on a disputed duel: the ruled loser gets a confirmed
 * fault, the ruled winner is exonerated. On a draw both sides are exonerated
 * (genuinely ambiguous — neither is proven at fault).
 */
export async function applyRuling(winnerId, loserId) {
  if (!winnerId && !loserId) return {};
  const [fault, cleared] = await Promise.all([
    loserId ? recordFault(loserId) : Promise.resolve(0),
    winnerId ? clearDispute(winnerId) : Promise.resolve(0),
  ]);
  return { faults: fault, disputes: cleared };
}

/** Draw ruling: neither side is at fault, exonerate both. */
export async function exonerateBoth(ch) {
  await Promise.all([
    ch.creatorUserId ? clearDispute(ch.creatorUserId) : Promise.resolve(0),
    ch.opponentUserId ? clearDispute(ch.opponentUserId) : Promise.resolve(0),
  ]);
}

export async function isBanned(userId) {
  return Boolean(await kvGet(`banned:${userId}`));
}

/** Snapshot for the client to display. */
export async function integrityOf(userId) {
  const [disputes, faults, banned] = await Promise.all([
    kvGet(`disputes:${userId}`),
    kvGet(`faults:${userId}`),
    kvGet(`banned:${userId}`),
  ]);
  return {
    disputes: disputes || 0,
    faults: faults || 0,
    threshold: DISPUTE_BAN_THRESHOLD,
    faultThreshold: FAULT_BAN_THRESHOLD,
    banned: Boolean(banned),
    banReason: banned ? banned.reason : null,
  };
}
