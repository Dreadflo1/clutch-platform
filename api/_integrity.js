/**
 * Dispute tracking + auto-ban — server-authoritative (a client-side ban is
 * trivially bypassed by clearing localStorage, so enforcement lives here).
 *
 * Every duel that ends in a dispute counts against BOTH players (one of them
 * mis-reported; honest players whose scores always match never accrue any).
 * At DISPUTE_BAN_THRESHOLD disputes the account is banned from starting or
 * accepting new duels. Existing duels still resolve normally.
 */
import { kvGet, kvSet } from './_kv.js';

export const DISPUTE_BAN_THRESHOLD = parseInt(process.env.DISPUTE_BAN_THRESHOLD) || 2;

/** Increment a user's dispute count; ban them if they hit the threshold. */
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

export async function isBanned(userId) {
  return Boolean(await kvGet(`banned:${userId}`));
}

/** Snapshot for the client to display (disputes X / threshold, banned flag). */
export async function integrityOf(userId) {
  const [disputes, banned] = await Promise.all([
    kvGet(`disputes:${userId}`),
    kvGet(`banned:${userId}`),
  ]);
  return { disputes: disputes || 0, threshold: DISPUTE_BAN_THRESHOLD, banned: Boolean(banned) };
}
