/**
 * Challenge lifecycle helpers — list bookkeeping, persistence, and the refund
 * resolvers that guarantee locked escrow can never be trapped forever.
 *
 * Key invariant: while a challenge still holds escrow it is persisted WITHOUT a
 * TTL, so the record can never expire out from under the funds it guards. Only
 * once a challenge reaches a terminal state (settled / cancelled / refunded) is
 * an archival TTL applied.
 */
import { kvGet, kvSet } from './_kv.js';
import { refundEscrow, BalanceError } from './_balance.js';

const OPEN_KEY = 'challenges:open';
const ACTIVE_KEY = 'challenges:active';

// Open-list TTL must exceed the maximum challenge lifetime (168h) so an open
// challenge can never vanish from the board while its escrow is still locked.
const OPEN_TTL = 9 * 24 * 3600;      // 9 days
const ARCHIVE_TTL = 90 * 24 * 3600;  // 90 days (terminal records)

// After acceptance, players have this long to settle before the match can be
// unwound as a draw (both stakes refunded). Closes the no-show / grief lock.
export const SETTLE_WINDOW_MS = 24 * 3600 * 1000; // 24h

// ── list bookkeeping ────────────────────────────────────────────
export async function getOpenList() {
  return (await kvGet(OPEN_KEY)) || [];
}
export async function saveOpenList(list) {
  await kvSet(OPEN_KEY, list.slice(0, 100), OPEN_TTL);
}
export async function getActiveList() {
  return (await kvGet(ACTIVE_KEY)) || [];
}
export async function addActive(id) {
  const a = (await kvGet(ACTIVE_KEY)) || [];
  if (!a.includes(id)) {
    a.unshift(id);
    await kvSet(ACTIVE_KEY, a.slice(0, 1000), OPEN_TTL);
  }
}
export async function removeActive(id) {
  const a = (await kvGet(ACTIVE_KEY)) || [];
  const n = a.filter(x => x !== id);
  if (n.length !== a.length) await kvSet(ACTIVE_KEY, n, OPEN_TTL);
}
async function removeOpen(id) {
  const list = await getOpenList();
  const n = list.filter(c => c.id !== id);
  if (n.length !== list.length) await saveOpenList(n);
}

// ── persistence ─────────────────────────────────────────────────
/** Persist a live (escrow-holding) challenge with NO expiry. */
export async function persist(ch) {
  await kvSet(`ch:${ch.id}`, ch); // no TTL
}
/** Persist a terminal challenge with an archival TTL. */
export async function archive(ch) {
  await kvSet(`ch:${ch.id}`, ch, ARCHIVE_TTL);
}

// ── refund resolvers (callers must hold the appropriate lock) ────
/**
 * Cancel an unaccepted challenge: refund the creator's stake, drop it from the
 * open board, and archive it. Idempotent — a non-open challenge is left alone.
 * @returns {'cancelled'|'noop'}
 */
export async function cancelOpen(ch, reason = 'cancelled') {
  if (ch.status !== 'open') return 'noop';
  try {
    await refundEscrow(ch.creatorUserId, ch.stake);
  } catch (e) {
    if (e instanceof BalanceError) return 'noop'; // already unwound elsewhere
    throw e;
  }
  ch.status = 'cancelled';
  ch.cancelReason = reason;
  ch.cancelledAt = Date.now();
  await removeOpen(ch.id);
  await archive(ch);
  return 'cancelled';
}

/**
 * Unwind an accepted-but-unsettled challenge as a draw: refund BOTH stakes,
 * drop it from the active list, and archive it. Idempotent.
 * @returns {'refunded'|'noop'}
 */
export async function refundDraw(ch, reason = 'timeout') {
  if (ch.status !== 'active' && ch.status !== 'awaiting_result' && ch.status !== 'disputed') {
    return 'noop';
  }
  // Refund each side independently; minEscrow guard makes a double-refund a noop.
  try {
    if (ch.creatorUserId) await refundEscrow(ch.creatorUserId, ch.stake);
  } catch (e) { if (!(e instanceof BalanceError)) throw e; }
  try {
    if (ch.opponentUserId) await refundEscrow(ch.opponentUserId, ch.stake);
  } catch (e) { if (!(e instanceof BalanceError)) throw e; }
  ch.status = 'refunded';
  ch.refundReason = reason;
  ch.refundedAt = Date.now();
  await removeActive(ch.id);
  await archive(ch);
  return 'refunded';
}
