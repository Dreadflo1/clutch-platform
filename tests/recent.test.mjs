// Public "latest verified results" feed: settleToWinner pushes a public snapshot,
// GET /api/challenges?recent returns it newest first with no private fields.
import assert from 'assert';
const C = await import(process.cwd() + '/api/_challenges.js');
const { kvSet, kvListPush, kvListRange } = await import(process.cwd() + '/api/_kv.js');
const { default: handler } = await import(process.cwd() + '/api/challenges/index.js');
let pass = 0; const t = async (n, f) => { await f(); pass++; console.log('ok', n); };
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) }); // silence registry pings

const call = async (query) => {
  const out = { headers: {} };
  const req = { method: 'GET', query, headers: { 'x-forwarded-for': '7.7.7.7' }, socket: {} };
  const res = {
    setHeader: (k, v) => { out.headers[k.toLowerCase()] = v; },
    status: c => { out.status = c; return res; },
    json: o => { out.body = o; return res; },
    end: () => res,
  };
  await handler(req, res);
  return out;
};

await t('list helper pushes newest first and caps', async () => {
  for (let i = 0; i < 5; i++) await kvListPush('t:list', { i }, 3);
  assert.deepEqual((await kvListRange('t:list', 0, -1)).map(x => x.i), [4, 3, 2]);
  assert.deepEqual((await kvListRange('t:list', 0, 0)).map(x => x.i), [4]);
});

await t('empty feed returns [] with a cache header', async () => {
  const r = await call({ recent: '' });
  assert.equal(r.status, 200); assert.deepEqual(r.body.results, []); assert.equal(r.body.count, 0);
  assert.match(r.headers['cache-control'], /s-maxage/);
});

async function duel(id, game, winnerIsOpponent) {
  const ch = {
    id, game, modeLabel: "1v1 · Summoner's Rift", modeVerifiable: true, stake: 50,
    creatorUserId: 'uA', creatorName: '0xabcd...1234', opponentUserId: 'uB', opponentName: 'Player',
    status: 'active',
  };
  // both stakes locked in escrow
  for (const u of ['uA', 'uB']) await kvSet(`bal:${u}`, { available: 450, escrow: 50 });
  const [w, l] = winnerIsOpponent ? ['uB', 'uA'] : ['uA', 'uB'];
  await C.settleToWinner(ch, w, l);
  await C.saveChallenge(ch);
}

await t('settle pushes a public result; endpoint returns newest first', async () => {
  await duel('CH_1', 'lol', false);
  await new Promise(r => setTimeout(r, 5));
  await duel('CH_2', 'valorant', true);
  const r = await call({ recent: '' });
  assert.equal(r.body.count, 2);
  const [a, b] = r.body.results;
  assert.equal(a.id, 'CH_2'); assert.equal(a.winnerName, 'Player'); assert.equal(a.game, 'valorant');
  assert.equal(b.id, 'CH_1'); assert.equal(b.winnerName, '0xabcd...1234'); assert.equal(b.entry, 50);
  assert.ok(a.settledAt >= b.settledAt); assert.equal(a.modeVerifiable, true);
});

await t('no private fields leak', async () => {
  const r = await call({ recent: '' });
  const keys = new Set(r.body.results.flatMap(Object.keys));
  assert.deepEqual([...keys].sort(), ['entry', 'game', 'id', 'modeLabel', 'modeVerifiable', 'settledAt', 'winnerName']);
  const s = JSON.stringify(r.body);
  for (const bad of ['uA', 'uB', 'payout', 'sig', 'creatorUserId', 'winner"']) assert.ok(!s.includes(bad), bad);
});

await t('caps at 6 results', async () => {
  for (let i = 3; i <= 10; i++) await duel('CH_' + i, 'dota2', i % 2 === 0);
  const r = await call({ recent: '' });
  assert.equal(r.body.count, 6); assert.equal(r.body.results[0].id, 'CH_10');
});

console.log(`${pass}/5 passed`);
