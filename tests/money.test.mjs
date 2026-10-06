/**
 * Money-path tests: sign-up, create, accept, cancel, settle, refunds, withdraw,
 * the public result feed and the admin gates. Every scenario runs twice: on the
 * in-memory dev store and on a real redis-server behind an Upstash-style REST
 * shim, so the Lua scripts are exercised for real.
 *
 *   node tests/money.test.mjs
 */
import assert from 'assert';
import { startShim } from './helpers/upstash-shim.mjs';

const root = process.cwd();
const imp = p => import(root + p);
const emailAuth = (await imp('/api/auth/email.js')).default;
const challenges = (await imp('/api/challenges/index.js')).default;
const settle = (await imp('/api/challenges/settle.js')).default;
const maintenance = (await imp('/api/challenges/maintenance.js')).default;
const resolve = (await imp('/api/challenges/resolve.js')).default;
const withdraw = (await imp('/api/wallet/withdraw.js')).default;
const feedApi = (await imp('/api/feed.js')).default;
const resultPage = (await imp('/api/r/[id].js')).default;
const { kvGet, kvSet } = await imp('/api/_kv.js');
const { createAccount } = await imp('/api/_account.js');
const { refundDraw } = await imp('/api/_challenges.js');
const { creditDeposit, failPayoutAndRefund, getPayout } = await imp('/api/_payments.js');
const { requireSecret, authorizeBearer } = await imp('/api/_secrets.js');
const { publicResult } = await imp('/api/_feed.js');

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('ok  ', name); }
  catch (e) { fail++; console.log('FAIL', name, '\n     ', e.stack.split('\n').slice(0, 3).join('\n      ')); }
}

let ipSeq = 0;
function call(handler, { method = 'POST', query = {}, body, token, headers = {} } = {}) {
  const req = {
    method, query, body,
    headers: { 'x-forwarded-for': `10.0.${(ipSeq >> 8) & 255}.${ipSeq++ & 255}`, ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    socket: {},
  };
  return new Promise((done, reject) => {
    const res = {
      statusCode: 200, headers: {},
      status(c) { this.statusCode = c; return this; },
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      json(b) { done({ status: this.statusCode, body: b, headers: this.headers }); return this; },
      send(b) { done({ status: this.statusCode, body: b, headers: this.headers }); return this; },
      end() { done({ status: this.statusCode, body: null, headers: this.headers }); return this; },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

async function signup(tag, name) {
  const r = await call(emailAuth, { body: { mode: 'signup', email: `${tag}@test.io`, password: 'password1', dob: '1995-01-01', name } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { token: r.body.token, id: r.body.user.id };
}
const bal = async id => kvGet(`bal:${id}`);
const create = (u, stake = 100, extra = {}) =>
  call(challenges, { token: u.token, body: { game: 'cs2', stake, mode: 'Aim 1v1', modeId: 'cs2_aim_1v1', ...extra } });
// Query flags are bare (`?accept`), exactly as the app sends them.
const accept = (u, id) => call(challenges, { token: u.token, query: { accept: '' }, body: { challengeId: id } });

async function suite(label) {
  const P = label + ':';
  const A = await signup(P.replace(':', '') + 'a', 'Alice');
  const B = await signup(P.replace(':', '') + 'b', 'Bob');
  const C = await signup(P.replace(':', '') + 'c', 'Cleo');

  await t(`${P} sign-up grants 500 CLU, public name never the email`, async () => {
    assert.deepEqual(await bal(A.id), { available: 500, escrow: 0, version: 1 });
    const anon = await call(emailAuth, { body: { mode: 'signup', email: `${label}anon@test.io`, password: 'password1', dob: '1995-01-01' } });
    assert.match(anon.body.user.name, /^Player-/);
  });

  await t(`${P} a repeated first login never resets an existing balance`, async () => {
    await kvSet(`bal:${C.id}`, { available: 120, escrow: 380, version: 7 });
    const created = await createAccount(C.id, { name: 'Cleo', via: 'email' }, { via: 'email' });
    assert.equal(created, false);
    assert.deepEqual(await bal(C.id), { available: 120, escrow: 380, version: 7 });
    await kvSet(`bal:${C.id}`, { available: 500, escrow: 0, version: 8 });
  });

  await t(`${P} underfunded create is a 400, not a 500`, async () => {
    const r = await create(A, 5000);
    assert.equal(r.status, 400, JSON.stringify(r.body));
  });

  await t(`${P} two duels posted at once both stay on the board`, async () => {
    const [r1, r2] = await Promise.all([create(A, 50), create(B, 60)]);
    assert.equal(r1.status, 201); assert.equal(r2.status, 201);
    const board = await call(challenges, { method: 'GET' });
    const ids = board.body.challenges.map(c => c.id);
    assert.ok(ids.includes(r1.body.challenge.id) && ids.includes(r2.body.challenge.id));
    assert.equal(r1.body.challenge.creatorName, 'Alice');
    // clean up: both creators cancel
    for (const [u, r] of [[A, r1], [B, r2]]) {
      const c = await call(challenges, { token: u.token, query: { cancel: '' }, body: { challengeId: r.body.challenge.id } });
      assert.equal(c.status, 200);
    }
  });

  await t(`${P} two players accepting at once: one wins, nobody's entry is trapped`, async () => {
    const ch = (await create(A, 100)).body.challenge;
    const [rb, rc] = await Promise.all([accept(B, ch.id), accept(C, ch.id)]);
    const ok = [rb, rc].filter(r => r.status === 200);
    assert.equal(ok.length, 1, `statuses ${rb.status} ${rc.status}`);
    const winner = rb.status === 200 ? B : C;
    const other = winner === B ? C : B;
    assert.equal((await bal(other.id)).escrow, 0);
    assert.equal((await kvGet(`ch:${ch.id}`)).opponentUserId, winner.id);
    // a late third accept after the first one completed must also fail cleanly
    const late = await accept(other, ch.id);
    assert.equal(late.status, 409);
    assert.equal((await bal(other.id)).escrow, 0);
    // settle it so later tests start from clean escrow
    await call(settle, { token: A.token, body: { challengeId: ch.id, myScore: 13, oppScore: 7 } });
    const s = await call(settle, { token: winner.token, body: { challengeId: ch.id, myScore: 7, oppScore: 13 } });
    assert.equal(s.body.status, 'settled');
    globalThis.__settled = { id: ch.id, loser: winner };
  });

  await t(`${P} accepting a cancelled duel fails and locks nothing`, async () => {
    const ch = (await create(B, 40)).body.challenge;
    await call(challenges, { token: B.token, query: { cancel: '' }, body: { challengeId: ch.id } });
    const before = await bal(C.id);
    const r = await accept(C, ch.id);
    assert.equal(r.status, 409);
    assert.deepEqual(await bal(C.id), before);
  });

  await t(`${P} settle pays the winner and publishes a public result`, async () => {
    const { id, loser } = globalThis.__settled;
    const ch = await kvGet(`ch:${id}`);
    assert.equal(ch.winner, A.id);
    assert.equal(ch.payout, 195); // 2 x 100 minus 2.5%
    const feed = await call(feedApi, { method: 'GET' });
    assert.ok(feed.body.settledTotal >= 1 && feed.body.settledThisWeek >= 1);
    const r = feed.body.recent.find(x => x.id === id);
    assert.equal(r.winner, 'Alice'); assert.equal(r.loser, loser === B ? 'Bob' : 'Cleo');
    assert.deepEqual(r.score, [13, 7]);
    assert.ok(!JSON.stringify(r).includes('@'), 'no emails in public results');
    assert.match(feed.headers['cache-control'], /s-maxage/);
    const page = await call(resultPage, { method: 'GET', query: { id } });
    assert.equal(page.status, 200);
    assert.match(page.body, /Alice beat (Bob|Cleo) 13-7 in Counter-Strike 2/);
    assert.match(page.body, /195 CLU/);
    const missing = await call(resultPage, { method: 'GET', query: { id: 'CH_nope' } });
    assert.equal(missing.status, 404);
    const recap = await call(feedApi, { method: 'GET', query: { recap: 'week' } });
    assert.match(recap.body.text, /duels? settled/);
  });

  await t(`${P} names in result cards are escaped`, async () => {
    const r = publicResult({ id: 'x', game: 'lol', stake: 10, payout: 19, winner: 'a', creatorUserId: 'a', creatorName: 'A&B', opponentName: 'C', settledAt: Date.now() });
    await kvSet('result:CH_esc', r);
    const page = await call(resultPage, { method: 'GET', query: { id: 'CH_esc' } });
    assert.ok(page.body.includes('A&amp;B') && !page.body.includes('>A&B<'));
  });

  await t(`${P} refunding an already-unwound duel is a safe no-op`, async () => {
    const ch = (await create(A, 30)).body.challenge;
    await accept(B, ch.id);
    const live = await kvGet(`ch:${ch.id}`);
    assert.equal(await refundDraw({ ...live }, 'timeout'), 'refunded');
    const after = [await bal(A.id), await bal(B.id)];
    // a second sweep over a stale copy must not refund again or throw
    assert.equal(await refundDraw({ ...live }, 'timeout'), 'refunded');
    assert.deepEqual([await bal(A.id), await bal(B.id)], after);
  });

  await t(`${P} a dispute waits for an admin, then unwinds after 7 days`, async () => {
    const ch = (await create(A, 20)).body.challenge;
    await accept(B, ch.id);
    await call(settle, { token: A.token, body: { challengeId: ch.id, result: 'win' } });
    await call(settle, { token: B.token, body: { challengeId: ch.id, result: 'win' } });
    let rec = await kvGet(`ch:${ch.id}`);
    assert.equal(rec.status, 'disputed');
    // past the 24h settle deadline: the sweep must leave it for the admin
    rec.settleDeadline = Date.now() - 1000; await kvSet(`ch:${ch.id}`, rec);
    await call(maintenance, { method: 'GET' });
    assert.equal((await kvGet(`ch:${ch.id}`)).status, 'disputed');
    // admin can still rule
    const ruled = await call(resolve, { body: { challengeId: ch.id, resolution: 'creator' } });
    assert.equal(ruled.body.status, 'settled');
    // and an unreviewed one is unwound after the review window
    const ch2 = (await create(A, 20)).body.challenge;
    await accept(B, ch2.id);
    await call(settle, { token: A.token, body: { challengeId: ch2.id, result: 'win' } });
    await call(settle, { token: B.token, body: { challengeId: ch2.id, result: 'win' } });
    rec = await kvGet(`ch:${ch2.id}`);
    rec.disputedAt = Date.now() - 8 * 24 * 3600 * 1000; await kvSet(`ch:${ch2.id}`, rec);
    await call(maintenance, { method: 'GET' });
    rec = await kvGet(`ch:${ch2.id}`);
    assert.equal(rec.status, 'refunded'); assert.equal(rec.refundReason, 'dispute_unreviewed');
  });

  await t(`${P} free CLU is never cashable`, async () => {
    await kvSet(`age:${C.id}`, { dob: '1995-01-01', adult: true, at: Date.now() });
    const r = await call(withdraw, { token: C.token, body: { amount: 50, rail: 'stripe' } });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.equal(r.body.withdrawable, 0);
    assert.equal((await bal(C.id)).available, 500);
  });

  await t(`${P} two parallel withdrawals cannot cash out more than was deposited`, async () => {
    await kvSet(`age:${A.id}`, { dob: '1995-01-01', adult: true, at: Date.now() });
    await creditDeposit({ userId: A.id, provider: 'stripe', ref: `${label}-dep1`, clu: 100 });
    const start = (await bal(A.id)).available;
    const rs = await Promise.all([1, 2, 3].map(() => call(withdraw, { token: A.token, body: { amount: 100, rail: 'stripe' } })));
    assert.equal(rs.filter(r => r.status === 202).length, 1, rs.map(r => r.status).join(','));
    assert.equal((await bal(A.id)).available, start - 100);
    assert.equal(Number(await kvGet(`withdrawn:${A.id}`)), 100);
    // a failed payout refunds the CLU and makes it withdrawable again
    const po = await getPayout(rs.find(r => r.status === 202).body.payoutId);
    await failPayoutAndRefund(po, 'test');
    assert.equal((await bal(A.id)).available, start);
    assert.equal(Number(await kvGet(`withdrawn:${A.id}`)), 0);
    const again = await call(withdraw, { token: A.token, body: { amount: 100, rail: 'stripe' } });
    assert.equal(again.status, 202);
  });

  await t(`${P} a replayed deposit webhook credits once`, async () => {
    const before = (await bal(B.id)).available;
    await creditDeposit({ userId: B.id, provider: 'stripe', ref: `${label}-dup`, clu: 70 });
    const second = await creditDeposit({ userId: B.id, provider: 'stripe', ref: `${label}-dup`, clu: 70 });
    assert.equal(second.duplicate, true);
    assert.equal((await bal(B.id)).available, before + 70);
    assert.equal(Number(await kvGet(`deposited:${B.id}`)), 70);
  });
}

// ── run on memory, then on real Redis ───────────────────────────
await suite('mem');
const shim = await startShim();
process.env.KV_REST_API_URL = shim.url;
process.env.KV_REST_API_TOKEN = 'test';
try { await suite('redis'); } finally { await shim.stop(); }
delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;

// ── secrets and admin gates ─────────────────────────────────────
await t('production refuses to run without a signing secret', async () => {
  const prev = process.env.VERCEL_ENV;
  const mod = await import(root + '/api/_secrets.js?prod');
  process.env.VERCEL_ENV = 'production';
  try {
    const prodMod = await import(root + '/api/_secrets.js?prod2');
    assert.throws(() => prodMod.requireSecret('NOPE_SECRET', 'x'), /SECRET_MISSING/);
  } finally { if (prev === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = prev; }
  assert.equal(mod.requireSecret('NOPE_SECRET', 'dev'), 'dev');
  assert.equal(requireSecret('NOPE_SECRET', 'dev'), 'dev');
});
await t('admin gate rejects a wrong or missing token', async () => {
  process.env.ADMIN_SECRET = 's3cret';
  const run = h => new Promise(done => {
    const res = { status(c) { this.c = c; return this; }, json() { done(this.c); } };
    const ok = authorizeBearer({ headers: h }, res);
    if (ok) done(200);
  });
  assert.equal(await run({ authorization: 'Bearer s3cret' }), 200);
  assert.equal(await run({ authorization: 'Bearer s3cres' }), 401);
  assert.equal(await run({}), 401);
  delete process.env.ADMIN_SECRET;
});

console.log(`\n${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
