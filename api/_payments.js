/**
 * Payments core — the provider-agnostic money on/off ramp that both rails
 * (on-chain crypto and Stripe) feed into. Everything funnels through the same
 * internal CLU ledger (bal:<user>) so escrow/settlement never has to know where
 * the money came from.
 *
 * Two invariants:
 *   1. Verify-before-credit: callers must confirm the real payment (an on-chain
 *      receipt, a signed Stripe event) BEFORE calling creditDeposit.
 *   2. Exactly-once: a given (provider, ref) credits at most once, ever —
 *      guarded by a permanent SET NX marker, so webhook retries and double
 *      submits are safe.
 */
import crypto from 'crypto';
import { kvGet, kvSet, kvSetNx, kvIncrBy, kvListPush, kvListRemove } from './_kv.js';
import { mutateBalance, debitWithdrawal, BalanceError } from './_balance.js';

// USD value of 1 CLU (display + conversion). Matches config.js TOKEN_USD_RATE.
const CLU_USD_RATE = parseFloat(process.env.CLU_USD_RATE || '0.10');

export function cluFromUsd(usd) {
  if (!(usd > 0)) return 0;
  return Math.floor(usd / CLU_USD_RATE);
}
export function usdFromClu(clu) {
  return Math.round(clu * CLU_USD_RATE * 100) / 100;
}
export function getCluUsdRate() {
  return CLU_USD_RATE;
}

/** Record a transaction and index it in the user's history (newest first, last 200). */
export async function appendTx(userId, tx) {
  await kvSet(`tx:${tx.id}`, tx, 7776000); // 90 days
  await kvListPush(`txlog:${userId}`, tx.id, { max: 200 });
}

export function newTxId() {
  return `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Credit a verified deposit to a user's available balance, exactly once.
 * @param {{userId:string, provider:string, ref:string, clu:number, meta?:object}} p
 * @returns {Promise<{credited:boolean, duplicate?:boolean, clu?:number, available?:number}>}
 */
export async function creditDeposit({ userId, provider, ref, clu, meta = {} }) {
  if (!userId || !provider || !ref) throw new Error('creditDeposit: userId, provider, ref required');
  if (!Number.isInteger(clu) || clu <= 0) throw new Error('creditDeposit: clu must be a positive integer');

  const payKey = `pay:${provider}:${ref}`;
  // Claim the payment first. If someone already claimed it, this is a replay.
  const claimed = await kvSetNx(payKey, {
    status: 'crediting', userId, provider, ref, clu, meta, at: Date.now(),
  });
  if (!claimed) {
    const prev = await kvGet(payKey);
    return { credited: false, duplicate: true, clu: prev?.clu, status: prev?.status };
  }

  let bal;
  try {
    bal = await mutateBalance(userId, { dAvailable: clu });
  } catch (e) {
    // Marked-but-not-credited: safer than risking a double credit. Queue it for
    // human reconciliation rather than silently retrying (a lost KV response
    // could otherwise double-credit).
    console.error(`[creditDeposit] RECONCILE ${payKey}: claimed but credit failed (${e.code || e.message})`);
    await kvListPush('deposits:reconcile', payKey, { max: 1000 });
    throw e;
  }

  const txId = newTxId();
  await appendTx(userId, {
    id: txId, userId, type: 'deposit', provider, ref, amount: clu,
    balAfter: bal.available, ts: Date.now(), meta,
  });
  await kvSet(payKey, { status: 'credited', userId, provider, ref, clu, txId, at: Date.now() });

  // Track lifetime real deposits — this is what caps how much can be withdrawn
  // (the free starting balance / un-deposited winnings are never cashable).
  await kvIncrBy(`deposited:${userId}`, clu);

  return { credited: true, clu, available: bal.available, txId };
}

/** How much this user may withdraw: lifetime deposited minus lifetime withdrawn. */
export async function withdrawableCap(userId) {
  const [dep, wd] = await Promise.all([kvGet(`deposited:${userId}`), kvGet(`withdrawn:${userId}`)]);
  return Math.max(0, (dep || 0) - (wd || 0));
}

/**
 * Create a withdrawal payout request: debit the user's CLU atomically (no
 * overdraft, no race), then enqueue a pending payout for the ops/settlement
 * layer to fulfil on the chosen rail. The actual outbound transfer is NOT sent
 * here (that needs a hot wallet / Stripe payout and belongs to a controlled
 * fulfilment step) — this guarantees funds leave the ledger exactly once and
 * are queued for payout.
 * @returns {Promise<{payoutId:string, clu:number, available:number}>}
 */
export async function createPayoutRequest({ userId, clu, rail, destination, meta = {}, dailyKey, dailyCap }) {
  if (!Number.isInteger(clu) || clu <= 0) throw new Error('createPayoutRequest: clu must be a positive integer');

  // Anti-faucet: a user can only cash out real money they've actually put in.
  // Lifetime withdrawals are capped at lifetime deposits, so the free starting
  // balance and un-deposited winnings are never withdrawable (this also keeps
  // real-money payout gated until KYC/compliance is in place). The cap check,
  // the daily cap and the debit happen atomically (see debitWithdrawal).
  const bal = await debitWithdrawal(userId, clu, { dailyKey, dailyCap });
  if (bal.err) {
    const e = new Error(bal.err);
    e.code = bal.err;
    e.cap = bal.cap;
    e.used = bal.used;
    throw e;
  }

  const payoutId = `po_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
  const payout = {
    id: payoutId, userId, clu, usd: usdFromClu(clu), rail, destination: destination || null,
    status: 'pending', createdAt: Date.now(), meta,
  };
  await kvSet(`payout:${payoutId}`, payout, 7776000);
  await kvListPush('payouts:pending', payoutId, { max: 5000 });

  const txId = newTxId();
  await appendTx(userId, {
    id: txId, userId, type: 'withdraw', amount: -clu, rail,
    ref: payoutId, balAfter: bal.available, ts: Date.now(),
  });

  return { payoutId, clu, available: bal.available };
}

// ── payout fulfilment lifecycle (used by the payout worker) ─────
export async function getPendingPayoutIds(limit = 50) {
  const q = (await kvGet('payouts:pending')) || [];
  return q.slice(0, limit);
}
export async function getPayout(id) {
  return kvGet(`payout:${id}`);
}
async function dequeuePending(id) {
  await kvListRemove('payouts:pending', id);
}

/** Claim a pending payout for processing. Returns true if this call claimed it. */
export async function claimPayout(payout) {
  if (payout.status !== 'pending') return false;
  payout.status = 'processing';
  payout.processingAt = Date.now();
  await kvSet(`payout:${payout.id}`, payout, 7776000);
  return true;
}

/** Mark a payout as broadcast/sent (records the outbound tx hash). */
export async function markPayoutSent(payout, txHash) {
  payout.status = 'sent';
  payout.txHash = txHash || null;
  payout.sentAt = Date.now();
  await kvSet(`payout:${payout.id}`, payout, 7776000);
  await dequeuePending(payout.id);
}

/** Park a payout for manual/off-platform fulfilment (e.g. Stripe Connect). */
export async function markPayoutManual(payout, note) {
  payout.status = 'manual_required';
  payout.note = note || null;
  payout.updatedAt = Date.now();
  await kvSet(`payout:${payout.id}`, payout, 7776000);
  await dequeuePending(payout.id);
}

/**
 * Fail a payout and REFUND the debited CLU back to the user's available balance,
 * exactly once (guarded by status). Use when the outbound transfer cannot be
 * made — the user must not lose funds that never left the platform.
 */
export async function failPayoutAndRefund(payout, reason) {
  if (payout.status === 'failed' || payout.status === 'sent') return; // already terminal
  const bal = await mutateBalance(payout.userId, { dAvailable: payout.clu });
  // The money never left, so it counts as withdrawable again.
  await kvIncrBy(`withdrawn:${payout.userId}`, -payout.clu);
  const txId = newTxId();
  await appendTx(payout.userId, {
    id: txId, userId: payout.userId, type: 'refund', amount: payout.clu,
    reason: `payout_failed:${reason || 'unknown'}`, ref: payout.id,
    balAfter: bal.available, ts: Date.now(),
  });
  payout.status = 'failed';
  payout.failReason = reason || 'unknown';
  payout.failedAt = Date.now();
  await kvSet(`payout:${payout.id}`, payout, 7776000);
  await dequeuePending(payout.id);
}

// ── deposit reconciliation (claimed but not credited) ───────────
export async function getReconcileList() {
  return (await kvGet('deposits:reconcile')) || [];
}
async function removeReconcile(payKey) {
  await kvListRemove('deposits:reconcile', payKey);
}
/**
 * Resolve a stuck deposit. 'credit' completes the credit (only if the record is
 * still 'crediting'); 'abandon' writes it off. Human-gated on purpose — a stuck
 * record means we don't know if the ledger mutation landed, so a person decides.
 * @returns {Promise<'credited'|'abandoned'|'already_credited'|'not_found'>}
 */
export async function resolveReconcile(payKey, action) {
  const rec = await kvGet(payKey);
  if (!rec) return 'not_found';
  if (rec.status === 'credited') { await removeReconcile(payKey); return 'already_credited'; }

  if (action === 'credit') {
    const bal = await mutateBalance(rec.userId, { dAvailable: rec.clu });
    const txId = newTxId();
    await appendTx(rec.userId, {
      id: txId, userId: rec.userId, type: 'deposit', provider: rec.provider,
      ref: rec.ref, amount: rec.clu, balAfter: bal.available, ts: Date.now(),
      reconciled: true,
    });
    rec.status = 'credited';
    rec.txId = txId;
    await kvSet(payKey, rec);
    await removeReconcile(payKey);
    return 'credited';
  }
  rec.status = 'abandoned';
  await kvSet(payKey, rec);
  await removeReconcile(payKey);
  return 'abandoned';
}

export { BalanceError };
