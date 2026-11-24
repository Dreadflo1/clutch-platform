// Daily registry summary: per-day counters bumped at the registry event points,
// one registry.daily log line, a 90-day KV copy, and one plain-text Telegram
// message to ADMIN_TELEGRAM_CHAT_ID, run from the maintenance cron.
import assert from 'assert';
const R = await import(process.cwd() + '/api/_registry.js');
const { kvGet, memSetSync } = await import(process.cwd() + '/api/_kv.js');
const { default: maintenance } = await import(process.cwd() + '/api/challenges/maintenance.js');
let pass = 0; const t = async (n, f) => { await f(); pass++; console.log('ok', n); };
let sent = []; let failTelegram = false;
globalThis.fetch = async (url, o) => {
  if (failTelegram) throw new Error('telegram down');
  sent.push(JSON.parse(o.body)); return { ok: true };
};
process.env.TELEGRAM_BOT_TOKEN = 'x'; process.env.ADMIN_TELEGRAM_CHAT_ID = '42';
const logs = []; const origLog = console.log;
console.log = (...a) => { if (String(a[0]).includes('registry.daily')) logs.push(a[0]); else origLog(...a); };
const req = ip => ({ headers: { 'x-forwarded-for': ip }, socket: {} });
const DAY = 864e5;
const now = Date.now();
const today = R.utcDay(now);

// Today's activity: 4 sign-ups (2 discord-fr, 1 duel-invite, 1 direct), 1 legacy back-fill.
await R.registerAccount('a1', { via: 'email', req: req('1.0.0.1'), ref: 'discord-fr' });
await R.registerAccount('a2', { via: 'telegram', req: req('1.0.0.2'), ref: 'Discord-FR' });
await R.registerAccount('a3', { via: 'wallet', req: req('1.0.0.3'), ref: 'duel-invite' });
await R.registerAccount('a4', { via: 'discord', req: req('1.0.0.4') });
await R.ensureRegistered('old1');
// a1 and a3 qualify through one settled duel; a2 + a4 play twice without game IDs.
await R.markHandle('a1', 'lol', 'one#1'); await R.markHandle('a3', 'lol', 'three#3');
await R.recordDuel('a1', 'a3');
await R.recordDuel('a2', 'a4'); await R.recordDuel('a2', 'a4');
// IP cluster: 5 accounts from one network, all with handles, one duel -> 2 excluded once each.
for (let i = 0; i < 5; i++) await R.registerAccount('f' + i, { via: 'email', req: req('9.9.9.9'), ref: 'farm' });
for (let i = 0; i < 5; i++) await R.markHandle('f' + i, 'lol', 'farm' + i);
await R.recordDuel('f0', 'f1'); await R.recordDuel('f0', 'f1');

await t('day counters recorded at the event points', async () => {
  const day = await kvGet(`regday:${today}`);
  assert.equal(day.accounts, 9);              // legacy back-fill not counted
  assert.equal(day.qualified, 2);
  assert.equal(day.flagged, 2);               // f0, f1 counted once despite two duels
  assert.equal(day.duels, 5);
  assert.equal(day['a:discord-fr'], 2); assert.equal(day['a:direct'], 1);
  assert.equal(day['q:discord-fr'], 1); assert.equal(day['q:duel-invite'], 1);
});

await t('summary for the previous UTC day, with running totals', async () => {
  const s = await R.buildDailySummary(now + DAY);
  assert.equal(s.date, today);
  assert.deepEqual(s.day, { accounts: 9, qualified: 2, flagged: 2, duels: 5 });
  assert.deepEqual(s.totals, { accounts: 10, qualified: 2, flagged: 2, duels: 5 });
  assert.deepEqual(Object.keys(s.bySource), ['discord-fr', 'duel-invite', 'farm', 'direct']);
  assert.deepEqual(s.bySource.farm, { accounts: 5, qualified: 0 });
  assert.equal(s.target, 20);
});

await t('week total sums Monday..day only', async () => {
  // 2030-01-09 is a Wednesday; 2030-01-06 is the Sunday before (previous ISO week).
  memSetSync('regday:2030-01-06', { qualified: 5 });
  memSetSync('regday:2030-01-07', { qualified: 2, accounts: 3 });
  memSetSync('regday:2030-01-09', { qualified: 1, 'q:reddit': 1, 'a:reddit': 4, accounts: 4 });
  const s = await R.buildDailySummary(Date.UTC(2030, 0, 10, 3));
  assert.equal(s.date, '2030-01-09'); assert.equal(s.week, '2030-W02');
  assert.equal(s.weekQualified, 3);
});

await t('maintenance cron logs, stores and sends once; no personal data', async () => {
  sent = [];
  const out = {};
  const res = { status: c => { out.status = c; return res; }, json: o => { out.body = o; return res; }, end: () => res };
  await maintenance({ method: 'GET', headers: {}, query: {} }, res);
  assert.equal(out.status, 200); assert.equal(out.body.dailySummary, R.utcDay(Date.now() - DAY));

  // Run again for "tomorrow" so the summary covers today's events.
  const s = await R.runDailySummary(now + DAY);
  assert.equal(s.telegramSent, true);
  const line = logs.at(-1); const parsed = JSON.parse(line);
  assert.equal(parsed.evt, 'audit.registry.daily'); assert.equal(parsed.day.accounts, 9);
  const stored = await kvGet(`registry:daily:${today}`); assert.equal(stored.totals.duels, 5);
  const msg = sent.at(-1);
  assert.equal(msg.chat_id, '42');
  assert.match(msg.text, /New accounts: 9 \(total 10\)/);
  assert.match(msg.text, /discord-fr 2\/1/);
  for (const secret of ['a1', 'a2', 'f0', 'one#1', '1.0.0.1', '9.9.9.9', 'userId', 'ipHash'])
    assert.ok(!msg.text.includes(secret) && !line.includes(`"${secret}"`), `leaked ${secret}`);
  assert.ok(!/\b(bet|wager|stake|gambl)/i.test(msg.text));
  assert.ok(!/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(msg.text), 'no emoji');

  // Retried cron: log + KV again, but no second Telegram message.
  const n = sent.length;
  await R.runDailySummary(now + DAY);
  assert.equal(sent.length, n);
  assert.equal((await R.dailyHistory(3, now + DAY))[0].date, today);
});

await t('Telegram failure never breaks maintenance', async () => {
  failTelegram = true;
  const out = {};
  const res = { status: c => { out.status = c; return res; }, json: o => { out.body = o; return res; }, end: () => res };
  await maintenance({ method: 'GET', headers: {}, query: {} }, res);
  const s = await R.runDailySummary(now + 3 * DAY);   // fresh day: lock taken, send throws inside
  failTelegram = false;
  assert.equal(out.status, 200); assert.ok(out.body.ok);
  assert.ok(s && s.date); assert.equal(s.telegramSent, false);
});

await t('many sources are capped, rest summed as other', async () => {
  const h = {};
  for (let i = 0; i < 14; i++) h[`a:src${String(i).padStart(2, '0')}`] = 1;
  const d = R.summarizeDay(h);
  assert.equal(Object.keys(d.bySource).length, 11); assert.deepEqual(d.bySource.other, { accounts: 4, qualified: 0 });
});

console.log = origLog;
console.log(`\n${pass}/6 passed`);
console.log('example telegram:\n' + sent.find(m => /New accounts: 9/.test(m.text))?.text);
console.log('example log:\n' + logs.find(l => /"accounts":9/.test(l)));
