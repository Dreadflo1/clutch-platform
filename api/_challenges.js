/**
 * Challenge lifecycle helpers — list bookkeeping, persistence, and the refund
 * resolvers that guarantee locked escrow can never be trapped forever.
 *
 * Key invariant: while a challenge still holds escrow it is persisted WITHOUT a
 * TTL, so the record can never expire out from under the funds it guards. Only
 * once a challenge reaches a terminal state (settled / cancelled / refunded) is
 * an archival TTL applied.
 */
import { kvGet, kvSet, kvListPush, kvListRemove } from './_kv.js';
import { refundEscrow, settleEscrow, BalanceError } from './_balance.js';
import { recordSettlement } from './_userstats.js';
import { recordDuel } from './_registry.js';
import { appendTx, newTxId } from './_payments.js';
import { recordResult } from './_feed.js';

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
// Every list update is a single atomic Lua op (kvListPush / kvListRemove), so two
// players posting or accepting at the same moment can never drop each other's
// entry from the board.
export async function getOpenList() {
  return (await kvGet(OPEN_KEY)) || [];
}
export async function addOpen(ch) {
  await kvListPush(OPEN_KEY, ch, { idField: 'id', max: 100, ttl: OPEN_TTL });
}
export async function removeOpen(id) {
  await kvListRemove(OPEN_KEY, id, { idField: 'id', ttl: OPEN_TTL });
}
export async function getActiveList() {
  return (await kvGet(ACTIVE_KEY)) || [];
}
export async function addActive(id) {
  await kvListPush(ACTIVE_KEY, id, { max: 1000, ttl: OPEN_TTL });
}
export async function removeActive(id) {
  await kvListRemove(ACTIVE_KEY, id, { ttl: OPEN_TTL });
}

// Per-user index of every challenge a player is part of (creator or opponent),
// so the client can list "my challenges" from the server instead of localStorage.
export async function addUserChallenge(userId, id) {
  if (!userId) return;
  await kvListPush(`userch:${userId}`, id, { max: 200 }); // no TTL — a player's history persists
}
export async function getUserChallengeIds(userId) {
  return (await kvGet(`userch:${userId}`)) || [];
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
  await appendTx(winnerId, { id: newTxId(), userId: winnerId, type: 'win', amount: payout, ref: ch.id, ts: Date.now(), balAfter: balWin?.available });
  await appendTx(loserId, { id: newTxId(), userId: loserId, type: 'loss', amount: -ch.stake, ref: ch.id, ts: Date.now(), balAfter: balLose?.available });

  ch.status = 'settled';
  ch.winner = winnerId;
  ch.payout = payout;
  ch.settledAt = Date.now();

  // Progression stats (badges/streaks). Runs only after settleEscrow succeeds,
  // so a double-settle (which throws above) never double-counts. Best-effort:
  // never let a stats failure affect the money settlement.
  try {
    await recordSettlement(winnerId, loserId, { game: ch.game, verified: !!ch.modeVerifiable });
  } catch (e) {
    console.warn('[settleToWinner] stats update failed', e?.message);
  }
  // Player registry (qualified-player counting). Best-effort, never blocks money.
  await recordDuel(winnerId, loserId, ch.settledAt);
  // Public results feed (share cards, landing board). Best-effort as well.
  await recordResult(ch);
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
      await appendTx(userId, {
        id: newTxId(), userId, type: 'refund', amount: credit, fee: feeEach,
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
