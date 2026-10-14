// Daily ledger reconciliation: sum of wallets (available + escrow) against
// opening + deposits - withdrawals + grants - fees, counters bumped atomically at
// every money movement, one audit.ledger.reconcile log line, a 90-day KV copy and
// a Telegram alert on drift, run from the maintenance cron.
import assert from 'assert';
const B = await import(process.cwd() + '/api/_balance.js');
const P = await import(process.cwd() + '/api/_payments.js');
const C = await import(process.cwd() + '/api/_challenges.js');
const L = await import(process.cwd() + '/api/_ledger.js');
const { kvGet, kvSetNx, memGetSync, memSetSync } = await import(process.cwd() + '/api/_kv.js');
const { default: maintenance } = await import(process.cwd() + '/api/challenges/maintenance.js');
let pass = 0; const t = async (n, f) => { await f(); pass++; console.log('ok', n); };
let sent = []; let failTelegram = false;
globalThis.fetch = async (url, o) => {
  if (failTelegram) throw new Error('telegram down');
  sent.push(JSON.parse(o.body)); return { ok: true };
};
process.env.TELEGRAM_BOT_TOKEN = 'x'; process.env.ADMIN_TELEGRAM_CHAT_ID = '42';
const logs = []; const origLog = console.log; const origWarn = console.warn;
console.log = (...a) => { if (String(a[0]).includes('ledger.reconcile')) logs.push(a[0]); else origLog(...a); };
console.warn = () => {};   // refund paths warn by design; keep the output readable
const DAY = 864e5;
const now = Date.now();
const day = k => now + k * DAY;
const held = () => ['legacy', 'u1', 'u2', 'u3'].reduce((s, u) => {
  const b = memGetSync(`bal:${u}`) || {}; return s + (b.available || 0) + (b.escrow || 0);
}, 0);
const lock = (u, stake) => B.mutateBalance(u, { dAvailable: -stake, dEscrow: stake, minAvailable: stake });

// A wallet from before the counters shipped (no grant counted for it).
memSetSync('bal:legacy', { available: 200, escrow: 50, version: 3 });

await t('sign-up grant creates the wallet once and counts it once', async () => {
  for (const u of ['u1', 'u2', 'u3']) assert.equal(await B.grantBalance(u, 500), true);
  assert.equal(await B.grantBalance('u1', 500), false);           // retried sign-up
  assert.equal(memGetSync('bal:u1').available, 500);
  assert.equal((await B.readLedgerTotals()).grants, 1500);
});

await t('first run sets the opening baseline and is balanced', async () => {
  const r = await L.runLedgerReconcile(day(0));
  assert.equal(r.baseline, true); assert.equal(r.opening, 250);
  assert.equal(r.held, 1750); assert.equal(r.expected, 1750);
  assert.equal(r.drift, 0); assert.equal(r.ok, true); assert.equal(r.alerted, false);
  assert.equal(sent.length, 0);
  const again = await L.runLedgerReconcile(day(0));
  assert.equal(again.baseline, false); assert.equal(again.opening, 250);   // set once only
});

await t('deposits, settle, draw refund, cancel and payouts keep it balanced', async () => {
  // Verified deposit, then a webhook replay (no second credit).
  assert.equal((await P.creditDeposit({ userId: 'u1', provider: 'stripe', ref: 'cs_1', clu: 300 })).credited, true);
  assert.equal((await P.creditDeposit({ userId: 'u1', provider: 'stripe', ref: 'cs_1', clu: 300 })).duplicate, true);
  // Deposit stuck in reconcile, credited by a person.
  await kvSetNx('pay:np:9', { status: 'crediting', userId: 'u2', provider: 'np', ref: '9', clu: 40 });
  assert.equal(await P.resolveReconcile('pay:np:9', 'credit'), 'credited');

  // Settled duel, entry 100 each: winner gets 195, fee 5.
  await lock('u1', 100); await lock('u2', 100);
  const ch1 = { id: 'CH_t1', game: 'lol', stake: 100, status: 'active', creatorUserId: 'u1', opponentUserId: 'u2' };
  assert.equal(await C.settleToWinner(ch1, 'u1', 'u2'), 195);
  // Timed-out duel, entry 40 each: each side gets 39 back, fee 1 + 1.
  await lock('u3', 40); await lock('u1', 40);
  const ch2 = { id: 'CH_t2', game: 'lol', stake: 40, status: 'active', creatorUserId: 'u3', opponentUserId: 'u1' };
  assert.equal(await C.refundDraw(ch2, 'timeout'), 'refunded');
  assert.equal(await C.refundDraw(ch2, 'timeout'), 'noop');          // no double refund, no double fee
  // Never-accepted challenge: full refund, no fee. Left open: still in escrow.
  await lock('u2', 25);
  assert.equal(await C.cancelOpen({ id: 'CH_t3', stake: 25, status: 'open', creatorUserId: 'u2' }), 'cancelled');
  await lock('u3', 60);
  // Payout requested then failed (CLU returned), another left pending.
  const po = await P.createPayoutRequest({ userId: 'u1', clu: 120, rail: 'crypto' });
  await P.failPayoutAndRefund(await P.getPayout(po.payoutId), 'test');
  await P.createPayoutRequest({ userId: 'u1', clu: 70, rail: 'crypto' });

  const tot = await B.readLedgerTotals();
  assert.deepEqual(tot, { deposits: 340, withdrawals: 70, grants: 1500, fees: 7, opening: 250 });
  const r = await L.runLedgerReconcile(day(1));
  assert.equal(r.held, held()); assert.equal(r.escrow, 50 + 60);
  assert.equal(r.expected, 250 + 340 - 70 + 1500 - 7);
  assert.equal(r.drift, 0); assert.equal(r.ok, true); assert.equal(sent.length, 0);
  const { alerted, ...stored } = r;                       // stored before the alert step
  assert.deepEqual(await kvGet(`ledger:reconcile:${r.date}`), stored);
});

await t('injected drift: logged, stored, one alert per day, no personal data', async () => {
  const b = memGetSync('bal:u2'); b.available += 7; memSetSync('bal:u2', b);   // CLU from nowhere
  const r = await L.runLedgerReconcile(day(2));
  assert.equal(r.drift, 7); assert.equal(r.ok, false); assert.equal(r.attempts, 3);
  assert.equal(r.alerted, true);
  const line = JSON.parse(logs.at(-1));
  assert.equal(line.evt, 'audit.ledger.reconcile');
  for (const f of ['date', 'available', 'escrow', 'expected', 'drift', 'ok']) assert.ok(f in line, f);
  assert.equal(line.drift, 7); assert.equal(line.ok, false);
  assert.equal((await kvGet(`ledger:reconcile:${r.date}`)).drift, 7);
  const msg = sent.at(-1);
  assert.equal(msg.chat_id, '42');
  assert.match(msg.text, /drift \+7 CLU/);
  assert.match(msg.text, /sign-up grants 1500 - fees 7/);
  for (const s of ['u1', 'u2', 'u3', 'legacy', 'CH_t', 'cs_1', 'userId'])
    assert.ok(!msg.text.includes(s) && !logs.at(-1).includes(s), `leaked ${s}`);
  assert.ok(!/\b(bet|wager|stake|gambl|pot)\b/i.test(msg.text));
  assert.ok(!/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(msg.text), 'no emoji');

  const n = sent.length;                                   // retried cron, same day
  assert.equal((await L.runLedgerReconcile(day(2))).alerted, false);
  assert.equal(sent.length, n);
  b.available -= 7; memSetSync('bal:u2', b);
  assert.equal((await L.runLedgerReconcile(day(3))).ok, true);
});

await t('too many wallets for the bounded scan: incomplete, alerted, no false number', async () => {
  const r = await L.runLedgerReconcile(day(4), { maxWallets: 2 });
  assert.equal(r.complete, false); assert.equal(r.truncated, true);
  assert.equal(r.drift, null); assert.equal(r.ok, false); assert.equal(r.alerted, true);
  assert.match(sent.at(-1).text, /incomplete, drift not measured/);
});

await t('maintenance cron runs it after the daily summary; Telegram down never breaks it', async () => {
  const run = async () => {
    const out = {};
    const res = { status: c => { out.status = c; return res; }, json: o => { out.body = o; return res; }, end: () => res };
    await maintenance({ method: 'GET', headers: {}, query: {} }, res);
    return out;
  };
  let out = await run();
  assert.equal(out.status, 200); assert.deepEqual(out.body.ledger, { date: new Date().toISOString().slice(0, 10), ok: true, drift: 0 });
  const b = memGetSync('bal:u3'); b.escrow += 1; memSetSync('bal:u3', b);
  failTelegram = true;
  const r = await L.runLedgerReconcile(day(5));            // fresh day: alert attempted, send throws
  out = await run();
  failTelegram = false;
  assert.equal(r.drift, 1); assert.equal(r.alerted, false);
  assert.equal(out.status, 200); assert.ok(out.body.ok); assert.equal(out.body.ledger.drift, 1);
});

console.log = origLog; console.warn = origWarn;
console.log(`\n${pass}/6 passed`);
console.log('example alert:\n' + sent.find(m => /drift \+7/.test(m.text))?.text);
console.log('example log:\n' + logs.find(l => /"drift":7/.test(l)));
