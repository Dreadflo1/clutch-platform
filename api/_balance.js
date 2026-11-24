/**
 * Atomic balance operations — the money-integrity layer.
 *
 * Every balance is stored at `bal:<userId>` as { available, escrow, version }.
 * All mutations go through here so read-modify-write can never race:
 *  - with KV, the whole check+update runs inside a single Lua EVAL (atomic in Redis)
 *  - in dev (no KV), the same logic runs synchronously on the in-memory store
 *    (no `await` between read and write, so it is atomic within the event loop)
 *
 * On failure a BalanceError is thrown with a machine-readable `.code`:
 *   NO_ACCOUNT | INSUFFICIENT_AVAILABLE | INSUFFICIENT_ESCROW | NEGATIVE
 *
 * Ledger counters (`ledger:totals`, a Redis HASH): every movement of CLU into or
 * out of the wallets bumps one running total IN THE SAME Lua script as the balance
 * change, so a counter can never disagree with the balances it describes (a lost
 * KV response leaves both applied or both not). Fields, all integer CLU:
 *   grants       free CLU created at sign-up (grantBalance)
 *   deposits     verified deposits credited (and the dev-only faucet)
 *   withdrawals  CLU debited for a payout request, minus failed payouts refunded
 *   fees         platform commission withheld at settlement or draw refund
 *   opening      sum of all wallets minus the flows above when reconciliation first
 *                ran (history before these counters shipped), set once
 * Invariant checked daily by api/_ledger.js:
 *   sum(available + escrow) == opening + deposits - withdrawals + grants - fees
 * Moves between available and escrow (lock, cancel refund) change no counter.
 */
import { kvActive, kvEval, memGetSync, memSetSync } from './_kv.js';

export const LEDGER_KEY = 'ledger:totals';
export const LEDGER_FIELDS = ['deposits', 'withdrawals', 'grants', 'fees'];

function checkLedger(ledger) {
  if (!ledger) return null;
  if (!LEDGER_FIELDS.includes(ledger.field) || !Number.isInteger(ledger.amount)) {
    throw new Error(`Bad ledger counter: ${ledger.field} ${ledger.amount}`);
  }
  return ledger;
}

/** Dev in-memory counter bump (same process, synchronous). */
function memLedgerBump(field, amount) {
  if (!amount) return;
  const t = memGetSync(LEDGER_KEY) || {};
  t[field] = (t[field] || 0) + amount;
  memSetSync(LEDGER_KEY, t);
}

export class BalanceError extends Error {
  constructor(code) {
    super(code);
    this.name = 'BalanceError';
    this.code = code;
  }
}

const KNOWN_CODES = ['NO_ACCOUNT', 'INSUFFICIENT_AVAILABLE', 'INSUFFICIENT_ESCROW', 'NEGATIVE'];

// A Lua error_reply comes back from the Upstash REST API as an HTTP error, so
// kvCommand throws a plain Error ("ERR NO_ACCOUNT"). Map it to a BalanceError so
// callers' `instanceof BalanceError` checks (double-settle / double-refund no-ops)
// behave the same on real KV as on the in-memory fallback.
async function evalBalance(script, keys, args) {
  try {
    return await kvEval(script, keys, args);
  } catch (e) {
    const code = KNOWN_CODES.find(c => String(e && e.message).includes(c));
    if (code) throw new BalanceError(code);
    throw e;
  }
}

function throwFromResult(str) {
  const code = KNOWN_CODES.find(c => String(str).includes(c));
  if (code) throw new BalanceError(code);
  throw new Error(`Balance op failed: ${str}`);
}

// ── mutateBalance: single-account atomic delta ──────────────────
// Applies dAvailable / dEscrow. Guards: minAvailable / minEscrow are the minimum
// values required BEFORE the mutation (-1 to skip). Result may not go negative.
// `ledger` ({ field, amount }) bumps one ledger:totals counter atomically with the
// balance change; pass it whenever CLU enters or leaves the wallets.
const MUTATE_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then return redis.error_reply('NO_ACCOUNT') end
local b = cjson.decode(raw)
local dA = tonumber(ARGV[1])
local dE = tonumber(ARGV[2])
local minA = tonumber(ARGV[3])
local minE = tonumber(ARGV[4])
b.available = b.available or 0
b.escrow = b.escrow or 0
if minA >= 0 and b.available < minA then return redis.error_reply('INSUFFICIENT_AVAILABLE') end
if minE >= 0 and b.escrow < minE then return redis.error_reply('INSUFFICIENT_ESCROW') end
b.available = b.available + dA
b.escrow = b.escrow + dE
if b.available < 0 or b.escrow < 0 then return redis.error_reply('NEGATIVE') end
b.version = (b.version or 0) + 1
redis.call('SET', KEYS[1], cjson.encode(b))
if KEYS[2] and ARGV[5] and ARGV[5] ~= '' then
  redis.call('HINCRBY', KEYS[2], ARGV[5], ARGV[6])
end
return cjson.encode(b)
`;

export async function mutateBalance(
  userId,
  { dAvailable = 0, dEscrow = 0, minAvailable = -1, minEscrow = -1, ledger = null } = {}
) {
  const key = `bal:${userId}`;
  ledger = checkLedger(ledger);

  if (kvActive()) {
    const keys = ledger ? [key, LEDGER_KEY] : [key];
    const args = [String(dAvailable), String(dEscrow), String(minAvailable), String(minEscrow)];
    if (ledger) args.push(ledger.field, String(ledger.amount));
    const res = await evalBalance(MUTATE_LUA, keys, args);
    if (typeof res === 'string' && res.startsWith('{')) return JSON.parse(res);
    return throwFromResult(res);
  }

  // Dev in-memory path — synchronous, no await between read and write.
  const b = memGetSync(key);
  if (!b) throw new BalanceError('NO_ACCOUNT');
  b.available = b.available || 0;
  b.escrow = b.escrow || 0;
  if (minAvailable >= 0 && b.available < minAvailable) throw new BalanceError('INSUFFICIENT_AVAILABLE');
  if (minEscrow >= 0 && b.escrow < minEscrow) throw new BalanceError('INSUFFICIENT_ESCROW');
  b.available += dAvailable;
  b.escrow += dEscrow;
  if (b.available < 0 || b.escrow < 0) throw new BalanceError('NEGATIVE');
  b.version = (b.version || 0) + 1;
  memSetSync(key, b);
  if (ledger) memLedgerBump(ledger.field, ledger.amount);
  return b;
}

// ── settleEscrow: two-account atomic settlement ─────────────────
// Winner: escrow -= stake, available += payout. Loser: escrow -= stake.
// Both accounts must hold at least `stake` in escrow. Fully atomic, including the
// fee counter: ledger:totals.fees += 2*stake - payout.
const SETTLE_LUA = `
local w = redis.call('GET', KEYS[1])
local l = redis.call('GET', KEYS[2])
if not w or not l then return redis.error_reply('NO_ACCOUNT') end
local wb = cjson.decode(w)
local lb = cjson.decode(l)
local stake = tonumber(ARGV[1])
local payout = tonumber(ARGV[2])
if (wb.escrow or 0) < stake or (lb.escrow or 0) < stake then return redis.error_reply('INSUFFICIENT_ESCROW') end
wb.escrow = wb.escrow - stake
wb.available = (wb.available or 0) + payout
lb.escrow = lb.escrow - stake
wb.version = (wb.version or 0) + 1
lb.version = (lb.version or 0) + 1
redis.call('SET', KEYS[1], cjson.encode(wb))
redis.call('SET', KEYS[2], cjson.encode(lb))
local fee = 2 * stake - payout
if fee ~= 0 then redis.call('HINCRBY', KEYS[3], 'fees', fee) end
return cjson.encode({ winner = wb, loser = lb })
`;

// ── refundEscrow: release a locked stake to its owner ───────────
// Removes `stake` from escrow and credits `creditAmount` back to available.
// creditAmount defaults to the full stake (a plain refund); pass a smaller
// amount to withhold a platform fee (e.g. unwinding a disputed challenge). The
// withheld remainder is the platform's implicit cut, exactly like settlement.
export async function refundEscrow(userId, stake, creditAmount = stake) {
  const fee = stake - creditAmount;
  return mutateBalance(userId, {
    dAvailable: creditAmount, dEscrow: -stake, minEscrow: stake,
    ledger: fee ? { field: 'fees', amount: fee } : null,
  });
}

export async function settleEscrow(winnerId, loserId, stake, payout) {
  const wKey = `bal:${winnerId}`;
  const lKey = `bal:${loserId}`;

  if (kvActive()) {
    const res = await evalBalance(SETTLE_LUA, [wKey, lKey, LEDGER_KEY], [String(stake), String(payout)]);
    if (typeof res === 'string' && res.startsWith('{')) return JSON.parse(res);
    return throwFromResult(res);
  }

  // Dev in-memory path — synchronous.
  const wb = memGetSync(wKey);
  const lb = memGetSync(lKey);
  if (!wb || !lb) throw new BalanceError('NO_ACCOUNT');
  if ((wb.escrow || 0) < stake || (lb.escrow || 0) < stake) throw new BalanceError('INSUFFICIENT_ESCROW');
  wb.escrow -= stake;
  wb.available = (wb.available || 0) + payout;
  lb.escrow -= stake;
  wb.version = (wb.version || 0) + 1;
  lb.version = (lb.version || 0) + 1;
  memSetSync(wKey, wb);
  memSetSync(lKey, lb);
  memLedgerBump('fees', 2 * stake - payout);
  return { winner: wb, loser: lb };
}

// ── grantBalance: create a new wallet holding free CLU ──────────
// Creates bal:<userId> = { available: amount, escrow: 0 } only if it does not
// exist yet (SET NX), and counts the grant in the same script. A retried or
// racing sign-up can neither overwrite an existing wallet nor count twice.
const GRANT_LUA = `
local ok = redis.call('SET', KEYS[1], ARGV[1], 'NX')
if not ok then return 0 end
redis.call('HINCRBY', KEYS[2], 'grants', ARGV[2])
return 1
`;

/** @returns {Promise<boolean>} true if the wallet was created (and the grant counted). */
export async function grantBalance(userId, amount) {
  if (!Number.isInteger(amount) || amount < 0) throw new Error('grantBalance: amount must be a non-negative integer');
  const key = `bal:${userId}`;
  const bal = { available: amount, escrow: 0, version: 1 };
  if (kvActive()) {
    return Number(await kvEval(GRANT_LUA, [key, LEDGER_KEY], [JSON.stringify(bal), String(amount)])) === 1;
  }
  if (memGetSync(key)) return false;
  memSetSync(key, bal);
  memLedgerBump('grants', amount);
  return true;
}

// ── ledger counter reads (used by the daily reconciliation) ─────
const LEDGER_READ_LUA = "return redis.call('HGETALL', KEYS[1])";
const LEDGER_OPEN_LUA = "return redis.call('HSETNX', KEYS[1], 'opening', ARGV[1])";

/** Current ledger:totals as numbers; `opening` is undefined until first set. */
export async function readLedgerTotals() {
  let raw;
  if (kvActive()) {
    const flat = (await kvEval(LEDGER_READ_LUA, [LEDGER_KEY], [])) || [];
    raw = {};
    for (let i = 0; i + 1 < flat.length; i += 2) raw[flat[i]] = flat[i + 1];
  } else {
    raw = memGetSync(LEDGER_KEY) || {};
  }
  const out = {};
  for (const f of LEDGER_FIELDS) out[f] = Number(raw[f]) || 0;
  if (raw.opening !== undefined) out.opening = Number(raw.opening) || 0;
  return out;
}

/** Set the opening baseline once (HSETNX). Returns true if this call set it. */
export async function setLedgerOpening(amount) {
  if (!Number.isInteger(amount)) throw new Error('setLedgerOpening: integer required');
  if (kvActive()) return Number(await kvEval(LEDGER_OPEN_LUA, [LEDGER_KEY], [String(amount)])) === 1;
  const t = memGetSync(LEDGER_KEY) || {};
  if (t.opening !== undefined) return false;
  t.opening = amount;
  memSetSync(LEDGER_KEY, t);
  return true;
}
