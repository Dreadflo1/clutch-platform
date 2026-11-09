/**
 * Daily ledger reconciliation — the escrow invariant as a measured number.
 *
 *   held     = sum over every wallet bal:<userId> of (available + escrow)
 *   expected = opening + deposits - withdrawals + grants - fees      (ledger:totals)
 *   drift    = held - expected                                        (must be 0)
 *
 * The right-hand side is a set of running counters bumped inside the same Lua
 * script as each balance change (see api/_balance.js). The left-hand side has no
 * counter on purpose: a running "sum of balances" would be bumped by the same code
 * it is meant to check. It is read from the wallets themselves with a BOUNDED SCAN
 * over the `bal:` prefix (MAX_WALLETS wallets, MAX_SCAN_CALLS round trips). That is
 * fine for today's user base; past a few thousand wallets (or a keyspace in the
 * millions) the check reports `complete: false` instead of a wrong number, and this
 * should move to a sharded or incremental scan.
 *
 * `opening` is set once, on the first run: whatever the wallets held beyond what
 * the counters explain (history from before the counters shipped). Drift that
 * existed before that first run is therefore absorbed into the baseline and not
 * detectable; everything after it is.
 *
 * Run from the maintenance cron (03:00 UTC). Writes one `audit.ledger.reconcile`
 * log line, a 90-day KV copy at ledger:reconcile:<YYYY-MM-DD> (the UTC day of the
 * run) and, if drift is non-zero or the check could not complete, one Telegram
 * message to ADMIN_TELEGRAM_CHAT_ID per day. Totals only: no user ids, no names.
 * Never throws.
 */
import { kvSet, kvLock, kvScanPrefix, kvMGet } from './_kv.js';
import { readLedgerTotals, setLedgerOpening } from './_balance.js';
import { auditLog } from './_log.js';
import { sendAdminTelegram, utcDay } from './_registry.js';

export const MAX_WALLETS = 5000;
const MAX_SCAN_CALLS = 400;
const KEEP = 90 * 24 * 3600;    // seconds a reconciliation result is kept
const ATTEMPTS = 3;             // re-measure when money moved mid-scan

/** Sum available and escrow over every wallet (bounded). */
export async function sumWallets({ maxWallets = MAX_WALLETS } = {}) {
  const { keys, truncated } = await kvScanPrefix('bal:', { maxKeys: maxWallets, maxCalls: MAX_SCAN_CALLS });
  const vals = await kvMGet(keys);
  let available = 0, escrow = 0, wallets = 0, unreadable = 0;
  for (const b of vals) {
    if (!b || typeof b !== 'object') { unreadable++; continue; }
    wallets++;
    available += Number(b.available) || 0;
    escrow += Number(b.escrow) || 0;
  }
  return { available, escrow, wallets, unreadable, truncated };
}

export function expectedFrom(t) {
  return (t.opening || 0) + t.deposits - t.withdrawals + t.grants - t.fees;
}

const sameTotals = (a, b) => ['deposits', 'withdrawals', 'grants', 'fees'].every(f => a[f] === b[f]);

/**
 * Measure both sides of the invariant. Counters are read before and after the
 * wallet scan; if drift is non-zero (for instance a settlement landed between
 * reading two wallets) it measures again, up to ATTEMPTS times. `stable` says
 * whether the counters stayed still during the last attempt. Pure money-side read
 * except for the one-time opening baseline.
 */
export async function measureLedger({ maxWallets = MAX_WALLETS } = {}) {
  let r;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const before = await readLedgerTotals();
    const w = await sumWallets({ maxWallets });
    const after = await readLedgerTotals();
    const stable = sameTotals(before, after);
    const complete = !w.truncated && w.unreadable === 0;
    const held = w.available + w.escrow;

    let baseline = false;
    if (after.opening === undefined && complete && stable) {
      // First run: everything the counters do not explain becomes the opening baseline.
      const opening = held - expectedFrom({ ...after, opening: 0 });
      if (await setLedgerOpening(opening)) baseline = true;
      after.opening = (await readLedgerTotals()).opening;
    }

    const expected = expectedFrom(after);
    const drift = complete ? held - expected : null;
    r = {
      available: w.available, escrow: w.escrow, held, expected, drift,
      ok: complete && after.opening !== undefined && drift === 0,
      complete, stable, baseline, attempts: attempt,
      wallets: w.wallets, unreadable: w.unreadable, truncated: w.truncated,
      opening: after.opening ?? null,
      deposits: after.deposits, withdrawals: after.withdrawals, grants: after.grants, fees: after.fees,
    };
    if (r.ok) break;
  }
  return r;
}

/** Plain-text alert: totals only. Pure. */
export function formatLedgerAlert(r) {
  const head = r.complete
    ? `CLUTCH ledger check ${r.date} (UTC): drift ${r.drift > 0 ? '+' : ''}${r.drift} CLU.`
    : `CLUTCH ledger check ${r.date} (UTC): incomplete, drift not measured.`;
  return [
    head,
    `Wallets hold ${r.held} CLU (available ${r.available}, in escrow ${r.escrow}) across ${r.wallets} wallets.`,
    `Counters expect ${r.expected} CLU: opening ${r.opening ?? 'unset'} + deposits ${r.deposits} - withdrawals ${r.withdrawals} + sign-up grants ${r.grants} - fees ${r.fees}.`,
    r.complete ? null : `Reason: ${r.truncated ? 'too many wallets for the bounded scan' : `${r.unreadable} unreadable wallets`}.`,
    r.complete && !r.stable ? 'Note: money moved during every attempt; re-run maintenance to confirm.' : null,
    'Details: audit.ledger.reconcile in the maintenance logs, and ledger:reconcile:' + r.date + ' in KV.',
  ].filter(Boolean).join('\n');
}

/**
 * Daily reconciliation: measure, log, store 90 days, alert on drift. Never throws:
 * returns the result or null.
 */
export async function runLedgerReconcile(now = Date.now(), opts = {}) {
  try {
    const m = await measureLedger(opts);
    const r = { date: utcDay(now), at: new Date(now).toISOString(), ...m };
    auditLog('ledger.reconcile', r);
    await kvSet(`ledger:reconcile:${r.date}`, r, KEEP);
    r.alerted = false;
    if (!r.ok && (await kvLock(`lock:ledger:alert:${r.date}`, 36 * 3600))) {
      r.alerted = await sendAdminTelegram(formatLedgerAlert(r));
    }
    return r;
  } catch (e) {
    console.warn('[ledger] reconcile failed', e?.message);
    return null;
  }
}
