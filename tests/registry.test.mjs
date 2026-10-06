import assert from 'assert';
const R = await import(process.cwd() + '/api/_registry.js');
const C = await import(process.cwd() + '/api/_challenges.js');
const { kvSet, kvGet } = await import(process.cwd() + '/api/_kv.js');
let pass = 0; const t = async (n, f) => { await f(); pass++; console.log('ok', n); };
const sent = []; globalThis.fetch = async (url, o) => { sent.push(JSON.parse(o.body).text); return { ok: true }; };
process.env.TELEGRAM_BOT_TOKEN = 'x'; process.env.ADMIN_TELEGRAM_CHAT_ID = '1';
const req = ip => ({ headers: { 'x-forwarded-for': ip }, socket: {} });

await t('register once', async () => {
  assert.equal(await R.registerAccount('u1', { via: 'email', req: req('1.1.1.1'), ref: 'Discord-FR!!' }), true);
  assert.equal(await R.registerAccount('u1', { via: 'email', req: req('1.1.1.1') }), false);
  const r = await kvGet('reg:u1'); assert.equal(r.ref, 'discord-fr'); assert.ok(r.ipHash && !r.ipHash.includes('1.1.1.1'));
});
for (const [id, ip] of [['u2','2.2.2.2'],['u3','3.3.3.3'],['u4','4.4.4.4'],['u5','5.5.5.5'],['u6','6.6.6.6']]) await R.registerAccount(id, { via: 'telegram', req: req(ip), ref: 'duel-invite' });

await t('duel alone does not qualify (no game ID)', async () => {
  await R.recordDuel('u1', 'u2');
  assert.equal((await kvGet('reg:u1')).qualifiedAt, null);
});
await t('game ID + duel qualifies', async () => {
  await R.markHandle('u1', 'lol', 'Faker#KR1');
  await R.markHandle('u2', 'lol', 'Rival#EUW');
  assert.ok((await kvGet('reg:u1')).qualifiedAt); assert.ok((await kvGet('reg:u2')).qualifiedAt);
});
await t('telegram ping every 3 real players', async () => {
  await R.markHandle('u3', 'valorant', 'a#1'); await R.markHandle('u4', 'valorant', 'b#2');
  await R.recordDuel('u3', 'u4');
  assert.equal(sent.length, 1); assert.match(sent[0], /3 real players/);
});
await t('ip cluster: 5 accounts one network are excluded', async () => {
  for (let i = 0; i < 5; i++) await R.registerAccount('f' + i, { via: 'email', req: req('9.9.9.9') });
  for (let i = 0; i < 5; i++) await R.markHandle('f' + i, 'lol', 'farm' + i);
  await R.recordDuel('f0', 'f1');
  assert.equal((await kvGet('reg:f0')).qualifiedAt, null);
});
await t('closed pair flagged in report after 3 duels', async () => {
  await R.markHandle('u5', 'lol', 'p5'); await R.markHandle('u6', 'lol', 'p6');
  await R.recordDuel('u5', 'u6'); await R.recordDuel('u5', 'u6'); await R.recordDuel('u6', 'u5');
  const rep = await R.loadReport({ isBanned: async () => false });
  const f = rep.flagged.find(x => x.userId === 'u5'); assert.ok(f && f.flags.includes('closed_pair'));
});
await t('report numbers', async () => {
  const rep = await R.loadReport({ isBanned: async id => id === 'u4' });
  // real: u1,u2,u3 (u4 banned; u5/u6 closed pair; f* cluster)
  assert.equal(rep.qualifiedThisWeek, 3); assert.equal(rep.qualifiedTotal, 3);
  assert.equal(rep.newAccountsThisWeek, 11); assert.equal(rep.target, 20);
  assert.equal(rep.channels['duel-invite'].accounts, 5); assert.equal(rep.channels['duel-invite'].qualified, 2);
  assert.equal(rep.channels['discord-fr'].cluPerQualified, 500);
  assert.ok(rep.flagged.some(x => x.userId === 'u4' && x.flags.includes('banned')));
  assert.ok(rep.flaggedExcluded >= 4);
});
await t('retention D7 from cohort', async () => {
  const DAY = 864e5, now = Date.now();
  const recs = [
    { userId: 'a', via: 'email', createdAt: now - 10*DAY, ref: null, handles: ['lol:a'], duels: 2, firstDuelAt: now - 8*DAY, lastDuelAt: now - 6*DAY, duelTs: [now-8*DAY, now-6*DAY], opponents: ['b'], qualifiedAt: now-8*DAY },
    { userId: 'b', via: 'email', createdAt: now - 10*DAY, ref: null, handles: ['lol:b'], duels: 1, firstDuelAt: now - 8*DAY, lastDuelAt: now - 8*DAY, duelTs: [now-8*DAY], opponents: ['a'], qualifiedAt: now-8*DAY },
  ];
  const rep = R.buildReport(recs, { now });
  if (rep.retention.d7.size) assert.equal(rep.retention.d7.returnedPct, 50);
  assert.equal(rep.retention.medianLifetimeDays, 1);
});
await t('settleToWinner feeds the registry and still pays', async () => {
  for (const u of ['s1','s2']) { await kvSet(`bal:${u}`, { available: 400, escrow: 100, version: 1 }); }
  const ch = { id: 'c1', stake: 100, game: 'lol', creatorUserId: 's1', opponentUserId: 's2' };
  const payout = await C.settleToWinner(ch, 's1', 's2');
  assert.equal(payout, 195); assert.equal((await kvGet('bal:s1')).available, 595);
  assert.equal((await kvGet('reg:s1')).duels, 1); assert.equal((await kvGet('reg:s2')).via, 'legacy');
});
console.log(`\n${pass}/9 passed`);
