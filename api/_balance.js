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
    const res = await kvEval(MUTATE_LUA, [key], [
      String(dAvailable),
      String(dEscrow),
      String(minAvailable),
      String(minEscrow),
    ]);
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

export async function settleEscrow(winnerId, loserId, stake, payout) {
  const wKey = `bal:${winnerId}`;
  const lKey = `bal:${loserId}`;

  if (kvActive()) {
    const res = await kvEval(SETTLE_LUA, [wKey, lKey], [String(stake), String(payout)]);
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
  return { winner: wb, loser: lb };
}
