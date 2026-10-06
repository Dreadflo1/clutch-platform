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
 */
import { kvActive, kvEval, memGetSync, memSetSync } from './_kv.js';

export class BalanceError extends Error {
  constructor(code) {
    super(code);
    this.name = 'BalanceError';
    this.code = code;
  }
}

const KNOWN_CODES = ['NO_ACCOUNT', 'INSUFFICIENT_AVAILABLE', 'INSUFFICIENT_ESCROW', 'NEGATIVE'];

function throwFromResult(str) {
  const code = KNOWN_CODES.find(c => String(str).includes(c));
  if (code) throw new BalanceError(code);
  throw new Error(`Balance op failed: ${str}`);
}

// Real Redis reports redis.error_reply() as an error RESPONSE ("ERR NO_ACCOUNT"),
// which the REST client raises as a plain Error. Map it back to a BalanceError so
// callers' `instanceof BalanceError` guards (insufficient funds -> 400, double
// refund/settle -> safe no-op) work in production, not only in the memory store.
async function evalBalance(script, keys, args) {
  let res;
  try {
    res = await kvEval(script, keys, args);
  } catch (e) {
    const code = KNOWN_CODES.find(c => String(e.message).includes(c));
    if (code) throw new BalanceError(code);
    throw e;
  }
  if (typeof res === 'string' && res.startsWith('{')) return JSON.parse(res);
  return throwFromResult(res);
}

// ── mutateBalance: single-account atomic delta ──────────────────
// Applies dAvailable / dEscrow. Guards: minAvailable / minEscrow are the minimum
// values required BEFORE the mutation (-1 to skip). Result may not go negative.
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
return cjson.encode(b)
`;

export async function mutateBalance(
  userId,
  { dAvailable = 0, dEscrow = 0, minAvailable = -1, minEscrow = -1 } = {}
) {
  const key = `bal:${userId}`;

  if (kvActive()) {
    return evalBalance(MUTATE_LUA, [key], [
      String(dAvailable),
      String(dEscrow),
      String(minAvailable),
      String(minEscrow),
    ]);
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
  return b;
}

// ── settleEscrow: two-account atomic settlement ─────────────────
// Winner: escrow -= stake, available += payout. Loser: escrow -= stake.
// Both accounts must hold at least `stake` in escrow. Fully atomic.
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
return cjson.encode({ winner = wb, loser = lb })
`;

// ── refundEscrow: release a locked stake to its owner ───────────
// Removes `stake` from escrow and credits `creditAmount` back to available.
// creditAmount defaults to the full stake (a plain refund); pass a smaller
// amount to withhold a platform fee (e.g. unwinding a disputed challenge). The
// withheld remainder is the platform's implicit cut, exactly like settlement.
export async function refundEscrow(userId, stake, creditAmount = stake) {
  return mutateBalance(userId, { dAvailable: creditAmount, dEscrow: -stake, minEscrow: stake });
}

export async function settleEscrow(winnerId, loserId, stake, payout) {
  const wKey = `bal:${winnerId}`;
  const lKey = `bal:${loserId}`;

  if (kvActive()) {
    return evalBalance(SETTLE_LUA, [wKey, lKey], [String(stake), String(payout)]);
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
  return { winner: wb, loser: lb };
}

// ── debitWithdrawal: cash-out debit with the anti-faucet caps, atomically ──
// Lifetime withdrawals may never exceed lifetime real deposits (free CLU and
// un-deposited winnings are never cashable), and a daily cap applies. Checking
// those caps in one request and debiting in another let two parallel withdrawals
// both pass the check and cash out more than was deposited. Here the checks,
// the debit and both counters move in one Lua EVAL.
// Returns the new balance, or { err: 'WITHDRAW_CAP'|'DAILY_CAP', cap|used }.
const WITHDRAW_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then return redis.error_reply('NO_ACCOUNT') end
local b = cjson.decode(raw)
local dep = tonumber(redis.call('GET', KEYS[2]) or '0') or 0
local wd = tonumber(redis.call('GET', KEYS[3]) or '0') or 0
local day = tonumber(redis.call('GET', KEYS[4]) or '0') or 0
local clu = tonumber(ARGV[1])
local cap = math.max(0, dep - wd)
if clu > cap then return cjson.encode({ err = 'WITHDRAW_CAP', cap = cap }) end
if day + clu > tonumber(ARGV[2]) then return cjson.encode({ err = 'DAILY_CAP', used = day }) end
b.available = b.available or 0
if b.available < clu then return redis.error_reply('INSUFFICIENT_AVAILABLE') end
b.available = b.available - clu
b.version = (b.version or 0) + 1
redis.call('SET', KEYS[1], cjson.encode(b))
redis.call('SET', KEYS[3], tostring(wd + clu))
redis.call('SET', KEYS[4], tostring(day + clu), 'EX', tonumber(ARGV[3]))
return cjson.encode(b)
`;

export async function debitWithdrawal(userId, clu, { dailyKey, dailyCap, dailyTtl = 86400 }) {
  const keys = [`bal:${userId}`, `deposited:${userId}`, `withdrawn:${userId}`, dailyKey];
  if (kvActive()) return evalBalance(WITHDRAW_LUA, keys, [String(clu), String(dailyCap), String(dailyTtl)]);

  // Dev in-memory path — synchronous.
  const b = memGetSync(keys[0]);
  if (!b) throw new BalanceError('NO_ACCOUNT');
  const dep = Number(memGetSync(keys[1])) || 0;
  const wd = Number(memGetSync(keys[2])) || 0;
  const day = Number(memGetSync(keys[3])) || 0;
  const cap = Math.max(0, dep - wd);
  if (clu > cap) return { err: 'WITHDRAW_CAP', cap };
  if (day + clu > dailyCap) return { err: 'DAILY_CAP', used: day };
  b.available = b.available || 0;
  if (b.available < clu) throw new BalanceError('INSUFFICIENT_AVAILABLE');
  b.available -= clu;
  b.version = (b.version || 0) + 1;
  memSetSync(keys[0], b);
  memSetSync(keys[2], wd + clu);
  memSetSync(keys[3], day + clu, dailyTtl);
  return b;
}
