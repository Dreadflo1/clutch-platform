/**
 * Challenge lifecycle helpers — list bookkeeping, persistence, and the refund
 * resolvers that guarantee locked escrow can never be trapped forever.
 *
 * Key invariant: while a challenge still holds escrow it is persisted WITHOUT a
 * TTL, so the record can never expire out from under the funds it guards. Only
 * once a challenge reaches a terminal state (settled / cancelled / refunded) is
 * an archival TTL applied.
 */
import crypto from 'crypto';
import { kvGet, kvSet } from './_kv.js';
import { refundEscrow, settleEscrow, BalanceError } from './_balance.js';

const OPEN_KEY = 'challenges:open';
const ACTIVE_KEY = 'challenges:active';
const PLATFORM_FEE = 0.025;

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

/**
 * Persist after a state change: archive + drop from the active list once
 * terminal; otherwise keep it live with no TTL so its escrow reference can
 * never expire out from under the funds it guards.
 */
export async function saveChallenge(ch) {
  if (ch.status === 'settled' || ch.status === 'cancelled' || ch.status === 'refunded') {
    await removeActive(ch.id);
    await archive(ch);
  } else {
    await persist(ch);
  }
}

// ── settlement to a winner (shared by settle + admin resolve) ───
/**
 * Release both escrows, credit the winner (stake*2 minus platform fee), log the
 * transactions, and stamp the challenge as settled. Mutates `ch` in place; the
 * caller persists it via saveChallenge(). Throws BalanceError if escrow is not
 * as expected (which makes a double-settle a safe no-op).
 * @returns {Promise<number>} payout credited to the winner
 */
export async function settleToWinner(ch, winnerId, loserId) {
  const payout = Math.floor(ch.stake * 2 * (1 - PLATFORM_FEE));
  await settleEscrow(winnerId, loserId, ch.stake, payout);

  const balWin = await kvGet(`bal:${winnerId}`);
  const balLose = await kvGet(`bal:${loserId}`);
  const txWin = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const txLose = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  await kvSet(`tx:${txWin}`, { id: txWin, userId: winnerId, type: 'win', amount: payout, ref: ch.id, ts: Date.now(), balAfter: balWin?.available }, 7776000);
  await kvSet(`tx:${txLose}`, { id: txLose, userId: loserId, type: 'loss', amount: -ch.stake, ref: ch.id, ts: Date.now(), balAfter: balLose?.available }, 7776000);

  const winLog = (await kvGet(`txlog:${winnerId}`)) || [];
  winLog.unshift(txWin);
  await kvSet(`txlog:${winnerId}`, winLog.slice(0, 200));
  const loseLog = (await kvGet(`txlog:${loserId}`)) || [];
  loseLog.unshift(txLose);
  await kvSet(`txlog:${loserId}`, loseLog.slice(0, 200));

  ch.status = 'settled';
  ch.winner = winnerId;
  ch.payout = payout;
  ch.settledAt = Date.now();
  return payout;
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
  console.warn(`[cancelOpen] ${ch.id} cancelled (${reason}): stake refunded in full, no commission`);
  return 'cancelled';
}

async function logTx(userId, tx) {
  await kvSet(`tx:${tx.id}`, tx, 7776000); // 90 days
  const log = (await kvGet(`txlog:${userId}`)) || [];
  log.unshift(tx.id);
  await kvSet(`txlog:${userId}`, log.slice(0, 200));
}

/**
 * Unwind an ACCEPTED challenge (both stakes locked) as a draw: release both
 * escrows, drop it from the active list, and archive it. Idempotent.
 *
 * The platform commission is ALWAYS levied here — each side gets its stake minus
 * its half of the fee — because a game was expected: this covers both a dispute
 * resolved as a draw and a no-show timeout, and neither may be a way to lock a
 * match then walk away fee-free. (Refunding a NEVER-accepted challenge in full is
 * a different path — see cancelOpen.)
 * @returns {'refunded'|'noop'}
 */
export async function refundDraw(ch, reason = 'timeout') {
  if (ch.status !== 'active' && ch.status !== 'awaiting_result' && ch.status !== 'disputed') {
    return 'noop';
  }
  const feeEach = Math.floor(ch.stake * PLATFORM_FEE);
  const credit = ch.stake - feeEach;

  // Refund each side independently; minEscrow guard makes a double-refund a noop.
  let refundedCount = 0;
  for (const userId of [ch.creatorUserId, ch.opponentUserId]) {
    if (!userId) continue;
    try {
      const bal = await refundEscrow(userId, ch.stake, credit);
      refundedCount++;
      const txId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      await logTx(userId, {
        id: txId, userId, type: 'refund', amount: credit, fee: feeEach,
        ref: ch.id, reason, ts: Date.now(), balAfter: bal.available,
      });
    } catch (e) { if (!(e instanceof BalanceError)) throw e; } // already unwound
  }

  if (reason === 'timeout') {
    // A no-show is an abnormal end — surface it for anti-abuse monitoring.
    console.warn(`[refundDraw] no-show timeout on ${ch.id}: refunded minus commission (fee ${feeEach}/side)`);
  }

  ch.status = 'refunded';
  ch.refundReason = reason;
  ch.feeCharged = feeEach * refundedCount;
  ch.refundedAt = Date.now();
  await removeActive(ch.id);
  await archive(ch);
  return 'refunded';
}
