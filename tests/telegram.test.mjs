import assert from 'assert';
process.env.TELEGRAM_WEBHOOK_SECRET = 's3cret';
const { default: handler, replyFor } = await import(process.cwd() + '/api/telegram.js');
const { kvSet } = await import(process.cwd() + '/api/_kv.js');
let pass = 0; const t = async (n, f) => { await f(); pass++; console.log('ok', n); };
const call = async (body, secret = 's3cret') => {
  let out = {}; const res = { status(c) { out.code = c; return this; }, json(b) { out.body = b; return out; } };
  await handler({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body }, res);
  return out;
};
const msg = (text, extra = {}) => ({ message: { text, chat: { id: 42, type: 'private' }, from: { language_code: 'en' }, ...extra } });
const BANNED = /\b(bet|bets|betting|stake|stakes|wager|gamble|pot)\b|pari|mise/i;

await t('refuses calls without the secret', async () => {
  assert.equal((await call(msg('/start'), 'nope')).code, 401);
});
await t('/start answers in the webhook response with sign-up and Discord buttons', async () => {
  const { code, body } = await call(msg('/start'));
  assert.equal(code, 200); assert.equal(body.method, 'sendMessage'); assert.equal(body.chat_id, 42);
  const urls = body.reply_markup.inline_keyboard.flat().map(b => b.url);
  assert.ok(urls.some(u => u.includes('ref=telegram-bot'))); assert.ok(urls.some(u => u.includes('discord.gg')));
  assert.match(body.text, /500 free CLU/);
});
await t('French users get French copy', async () => {
  const r = await replyFor({ text: '/start', from: { language_code: 'fr-FR' } });
  assert.match(r.text, /gratuits/);
});
await t('open duel deep link shows the duel with an Accept link carrying the join code', async () => {
  const id = 'CH_1791658442591_abcd1234';
  await kvSet(`ch:${id}`, { id, sig: 'f'.repeat(64), game: 'valorant', stake: 50, condition: 'First to 13', status: 'open', expiresAt: Date.now() + 3600e3 });
  const r = await replyFor({ text: `/start d_${id}`, from: {} });
  assert.match(r.text, /Valorant/); assert.match(r.text, /50 CLU/); assert.match(r.text, /First to 13/);
  const url = r.reply_markup.inline_keyboard[0][0].url;
  const code = new URL(url).searchParams.get('join');
  assert.deepEqual(JSON.parse(Buffer.from(code, 'base64url').toString()), { id, sig: 'f'.repeat(64) });
});
await t('taken or unknown duel says so', async () => {
  const id = 'CH_1791658442591_00000000';
  await kvSet(`ch:${id}`, { id, sig: 'x', game: 'lol', stake: 10, status: 'active' });
  assert.match((await replyFor({ text: `/start d_${id}`, from: {} })).text, /no longer open/);
  assert.match((await replyFor({ text: '/start d_CH_1_ffffffff', from: {} })).text, /no longer open/);
});
await t('malformed start payload falls back to the welcome', async () => {
  assert.match((await replyFor({ text: '/start d_../../x', from: {} })).text, /500 free CLU/);
});
await t('/stop explains nothing is kept', async () => {
  assert.match((await replyFor({ text: '/stop', from: {} })).text, /keeps nothing/);
});
await t('ignores groups and non-text updates', async () => {
  assert.equal((await call(msg('/start', { chat: { id: 1, type: 'group' } }))).body.method, undefined);
  assert.equal((await call({ edited_message: {} })).body.method, undefined);
});
await t('no betting vocabulary in any reply', async () => {
  for (const lc of ['en', 'fr']) for (const text of ['/start', '/stop', '/start d_CH_1791658442591_abcd1234', '/start d_CH_1_ffffffff']) {
    const r = await replyFor({ text, from: { language_code: lc } });
    assert.ok(!BANNED.test(r.text), `${lc} ${text}: ${r.text}`);
  }
});
console.log(`${pass} passed`);
