// Security hardening checks (audit of 2026-11-25): tokens, encryption, input
// handling, login throttling, bot protection, field tampering, response trimming
// and client config. In-memory KV, no network.
import assert from 'assert';
import fs from 'fs';
import { spawnSync } from 'child_process';
const root = process.cwd();
const J = await import(root + '/api/_jwt.js');
const X = await import(root + '/api/_crypto.js');
const S = await import(root + '/api/_sanitize.js');
const { authorizeBearer } = await import(root + '/api/_secrets.js');
const { kvGet, kvSet } = await import(root + '/api/_kv.js');
const { default: email } = await import(root + '/api/auth/email.js');
const { default: challenges } = await import(root + '/api/challenges/index.js');
const { ageFromDob } = await import(root + '/api/_age.js');
let pass = 0; const t = async (n, f) => { await f(); pass++; console.log('ok', n); };
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) }); // silence registry pings

let ipSeq = 0;
const newIp = () => `10.0.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
const call = async (handler, { method = 'POST', body, query = {}, headers = {}, ip } = {}) => {
  const out = { headers: {} };
  const req = { method, query, body, headers: { 'x-forwarded-for': ip || newIp(), ...headers }, socket: {} };
  const res = {
    setHeader: (k, v) => { out.headers[k.toLowerCase()] = v; },
    status: c => { out.status = c; return res; },
    json: o => { out.body = o; return res; },
    end: () => res,
    redirect: (u) => { out.status = 302; out.location = u; return res; },
  };
  await handler(req, res);
  return out;
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

// ── tokens ─────────────────────────────────────────────────────
await t('JWT: valid token verifies, tampered body or signature does not', async () => {
  const tok = J.signJwt({ sub: 'u1' });
  assert.equal(J.verifyJwt(tok).sub, 'u1');
  const [h, , s] = tok.split('.');
  assert.equal(J.verifyJwt(`${h}.${b64({ sub: 'admin', exp: 9e9 })}.${s}`), null);
  assert.equal(J.verifyJwt(tok.slice(0, -2) + 'xx'), null);
});
await t('JWT: alg "none" and missing/expired exp are refused', async () => {
  assert.equal(J.verifyJwt(`${b64({ alg: 'none' })}.${b64({ sub: 'u1', exp: 9e9 })}.`), null);
  assert.equal(J.verifyJwt(J.signJwt({ sub: 'u1' }, -10)), null);
});

// ── encryption at rest ─────────────────────────────────────────
await t('sealField/openField round-trip; ciphertext hides the value', async () => {
  const sealed = X.sealField('player@example.com');
  assert.ok(sealed.startsWith('enc:v1:') && !sealed.includes('player'));
  assert.notEqual(X.sealField('player@example.com'), sealed); // random IV
  assert.equal(X.openField(sealed), 'player@example.com');
});
await t('openField passes legacy plaintext through and rejects tampering', async () => {
  assert.equal(X.openField('legacy@example.com'), 'legacy@example.com');
  const sealed = X.sealField('1990-01-01');
  const bad = sealed.slice(0, -3) + (sealed.endsWith('A') ? 'BBB' : 'AAA');
  assert.equal(X.openField(bad), null);
});
await t('age check reads an encrypted DOB', async () => {
  assert.ok(ageFromDob(X.sealField('1990-01-01')) >= 35);
  assert.equal(ageFromDob(12345), null);
  assert.equal(ageFromDob('1800-01-01'), null);
});

// ── input handling ─────────────────────────────────────────────
await t('readJson: bad JSON, arrays and huge bodies are refused', async () => {
  assert.equal(S.readJson({ body: '{bad' }), null);
  assert.equal(S.readJson({ body: '[1,2]' }), null);
  assert.equal(S.readJson({ body: '"x'.padEnd(200001, 'x') + '"' }), null);
  assert.deepEqual(S.readJson({ body: undefined }), {});
  assert.deepEqual(S.readJson({ body: '{"a":1}' }), { a: 1 });
});
await t('cleanDisplayName strips markup and control characters', async () => {
  assert.equal(S.cleanDisplayName('<img src=x onerror=alert(1)>Neo'), 'img src=x onerror=alert(1)Neo');
  assert.ok(!/[<>"']/.test(S.cleanDisplayName('"><script>')));
  assert.equal(S.cleanDisplayName('   '), 'Player');
});
await t('trustedOrigin ignores a foreign Origin header', async () => {
  assert.equal(S.trustedOrigin({ headers: { origin: 'https://evil.example' } }), 'https://www.clutch.best');
  assert.equal(S.trustedOrigin({ headers: { origin: 'https://clutch.best' } }), 'https://clutch.best');
});
await t('malformed JSON gets a 400, not a crash', async () => {
  const r = await call(email, { body: '{not json' });
  assert.equal(r.status, 400);
});

// ── admin gate ─────────────────────────────────────────────────
await t('admin gate: wrong secret 401, right secret passes, failures are capped', async () => {
  process.env.ADMIN_SECRET = 'test-admin-secret-long-enough';
  const ip = newIp();
  const ok = await call((q, s) => authorizeBearer(q, s).then(v => v && s.status(200).json({})), { headers: { authorization: 'Bearer test-admin-secret-long-enough' }, ip });
  assert.equal(ok.status, 200);
  let last;
  for (let i = 0; i < 11; i++) last = await call((q, s) => authorizeBearer(q, s), { headers: { authorization: 'Bearer nope' }, ip });
  assert.equal(last.status, 429);
  delete process.env.ADMIN_SECRET;
});

// ── passwords, login throttle, bot protection ──────────────────
const DOB = '1990-01-01';
await t('signup stores a scrypt hash and encrypted email, never the password', async () => {
  const r = await call(email, { body: { mode: 'signup', email: 'Sec@Example.com', password: 'hunter2hunter2', name: '<b>Neo</b>', dob: DOB } });
  assert.equal(r.status, 200);
  const id = r.body.user.id;
  const cred = await kvGet(`cred:${id}`);
  assert.ok(cred.hash && cred.salt && cred.N >= 32768);
  assert.ok(!JSON.stringify(cred).includes('hunter2') && !JSON.stringify(cred).includes('sec@example.com'));
  const user = await kvGet(id);
  assert.ok(user.email.startsWith('enc:v1:'));
  assert.equal(r.body.user.name, 'bNeo/b');
  assert.ok(!('email' in r.body.user) && !('hash' in r.body.user));
  const age = await kvGet(`age:${id}`);
  assert.ok(age.dob.startsWith('enc:v1:'));
});
await t('login works, wrong password is throttled after 8 failures', async () => {
  const ok = await call(email, { body: { mode: 'login', email: 'sec@example.com', password: 'hunter2hunter2' } });
  assert.equal(ok.status, 200);
  for (let i = 0; i < 8; i++) {
    const r = await call(email, { body: { mode: 'login', email: 'sec@example.com', password: 'wrong-password' } });
    assert.equal(r.status, 401);
  }
  const blocked = await call(email, { body: { mode: 'login', email: 'sec@example.com', password: 'hunter2hunter2' } });
  assert.equal(blocked.status, 429);
});
await t('legacy N=16384 hashes still log in and get upgraded', async () => {
  const crypto = await import('crypto');
  const mail = 'legacy@example.com';
  const id = 'user_email_' + crypto.createHash('sha256').update(mail).digest('hex').slice(0, 24);
  const salt = 'abcd';
  await kvSet(`cred:${id}`, { salt, hash: crypto.scryptSync('oldpassword1', salt, 64).toString('hex'), email: mail });
  await kvSet(id, { addr: null, email: mail, name: 'old', via: 'email' });
  const r = await call(email, { body: { mode: 'login', email: mail, password: 'oldpassword1' } });
  assert.equal(r.status, 200);
  const cred = await kvGet(`cred:${id}`);
  assert.equal(cred.N, 32768);
  assert.ok(cred.email.startsWith('enc:v1:') && (await kvGet(id)).email.startsWith('enc:v1:'));
});
await t('honeypot field filled → refused', async () => {
  const r = await call(email, { body: { mode: 'signup', email: 'bot@example.com', password: 'password123', dob: DOB, website: 'http://spam' } });
  assert.equal(r.status, 400);
  assert.equal(await kvGet('cred:' + 'x'), null);
});
await t('more than 5 signups from one IP in an hour → 429', async () => {
  const ip = newIp();
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await call(email, { ip, body: { mode: 'signup', email: `b${i}@ex.com`, password: 'password123', dob: DOB } })).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
});

// ── field tampering, record access, trimmed responses ──────────
let ownerTok, otherTok, chId;
await t('create ignores client-sent creatorWins and clamps expiry', async () => {
  const a = await call(email, { body: { mode: 'signup', email: 'owner@ex.com', password: 'password123', dob: DOB, name: 'Owner' } });
  const b = await call(email, { body: { mode: 'signup', email: 'other@ex.com', password: 'password123', dob: DOB, name: 'Other' } });
  ownerTok = a.body.token; otherTok = b.body.token;
  const r = await call(challenges, { headers: { authorization: 'Bearer ' + ownerTok },
    body: { game: 'lol', stake: 50, mode: 'Ranked Win', creatorWins: 999, expiryHours: -5, available: 1e9, creatorUserId: 'someone_else' } });
  assert.equal(r.status, 201);
  chId = r.body.challenge.id;
  assert.equal(r.body.challenge.creatorWins, 0);
  assert.ok(r.body.challenge.expiresAt > Date.now());
  assert.equal(r.body.challenge.creatorUserId, J.verifyJwt(ownerTok).sub);
  assert.equal((await kvGet(`bal:${J.verifyJwt(ownerTok).sub}`)).available, 450);
});
await t('invalid challengeType, non-integer stake and bad ids are refused', async () => {
  const h = { authorization: 'Bearer ' + ownerTok };
  assert.equal((await call(challenges, { headers: h, body: { game: 'lol', stake: 50, mode: 'x1', challengeType: '<script>' } })).status, 400);
  assert.equal((await call(challenges, { headers: h, body: { game: 'lol', stake: '50.5', mode: 'x1' } })).status, 400);
  assert.equal((await call(challenges, { headers: h, query: { cancel: '' }, body: { challengeId: '../bal:x' } })).status, 400);
});
await t('only the creator can cancel', async () => {
  const r = await call(challenges, { headers: { authorization: 'Bearer ' + otherTok }, query: { cancel: '' }, body: { challengeId: chId } });
  assert.equal(r.status, 403);
});
await t('public board hides user ids and signatures; owner sees "mine"', async () => {
  const anon = await call(challenges, { method: 'GET' });
  const c = anon.body.challenges.find(x => x.id === chId);
  assert.ok(c && !('creatorUserId' in c) && !('sig' in c) && c.mine === false);
  const own = await call(challenges, { method: 'GET', headers: { authorization: 'Bearer ' + ownerTok } });
  const m = own.body.challenges.find(x => x.id === chId);
  assert.ok(m.mine === true && m.creatorUserId);
});
await t('bare ?accept and ?cancel flags reach their flows (as the app sends them)', async () => {
  const r2 = await call(challenges, { headers: { authorization: 'Bearer ' + ownerTok }, body: { game: 'lol', stake: 20, mode: 'Ranked Win' } });
  const acc = await call(challenges, { headers: { authorization: 'Bearer ' + otherTok }, query: { accept: '' }, body: { challengeId: chId } });
  assert.equal(acc.status, 200, JSON.stringify(acc.body));
  const can = await call(challenges, { headers: { authorization: 'Bearer ' + ownerTok }, query: { cancel: '' }, body: { challengeId: r2.body.challenge.id } });
  assert.equal(can.status, 200, JSON.stringify(can.body));
});
await t('POST without a session is refused', async () => {
  assert.equal((await call(challenges, { body: { game: 'lol', stake: 50, mode: 'x1' } })).status, 401);
});

// ── client config, faucet on previews ──────────────────────────
await t('config.js (served to browsers) holds no key or secret fields', async () => {
  const src = fs.readFileSync(root + '/config.js', 'utf8');
  assert.ok(!/\b[A-Z_]*(KEY|SECRET|TOKEN|PASSWORD)\s*:/.test(src), 'config.js must not define key/secret fields');
});
await t('demo deposit faucet and admin gates are closed on preview deployments', async () => {
  const script = `
    const { default: dep } = await import(${JSON.stringify(root + '/api/wallet/deposit.js')});
    const { authorizeBearer } = await import(${JSON.stringify(root + '/api/_secrets.js')});
    const out = {}; const res = { status: c => { out.s = c; return res; }, json: () => res, end: () => res };
    await dep({ method: 'POST', headers: {}, body: { amount: 100 } }, res);
    const a = out.s; out.s = 0;
    await authorizeBearer({ headers: {} }, res);
    console.log(a + ',' + out.s);`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, VERCEL_ENV: 'preview', ADMIN_SECRET: '' }, encoding: 'utf8',
  });
  assert.equal(r.stdout.trim().split('\n').pop(), '410,503', r.stderr);
});

console.log(`\n${pass} passed`);
