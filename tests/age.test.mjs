import assert from 'assert';
const A = await import(process.cwd() + '/api/_age.js');
const { kvSet } = await import(process.cwd() + '/api/_kv.js');

function dobYearsAgo(years, extraDays = 0) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - extraDays);
  return d.toISOString().slice(0, 10);
}

let n = 0, pass = 0;
async function t(name, fn) { n++; try { await fn(); pass++; console.log('ok  ', name); } catch (e) { console.log('FAIL', name, e.message); } }

await t('minimum age is 18', () => assert.equal(A.MIN_AGE, 18));
await t('17-year-old is refused', async () => {
  const r = await A.confirmAge('a17', dobYearsAgo(17, 10));
  assert.equal(r.ok, false); assert.equal(r.error, 'under_min');
  assert.equal(await A.isAgeConfirmed('a17'), false);
});
await t('16-year-old is refused', async () => {
  const r = await A.confirmAge('a16', dobYearsAgo(16, 10));
  assert.equal(r.ok, false);
});
await t('18-year-old is accepted and adult', async () => {
  const r = await A.confirmAge('a18', dobYearsAgo(18, 1));
  assert.equal(r.ok, true);
  assert.equal(await A.isAgeConfirmed('a18'), true);
  assert.equal(await A.isAdult('a18'), true);
});
await t('legacy 16+ record for a 17-year-old no longer passes', async () => {
  await kvSet('age:legacy17', { confirmed: true, adult: false, age: 17, dob: dobYearsAgo(17, 10), confirmedAt: Date.now() });
  assert.equal(await A.isAgeConfirmed('legacy17'), false);
  assert.equal(await A.isAdult('legacy17'), false);
});
await t('legacy record re-checked from DOB once the person turns 18', async () => {
  await kvSet('age:legacyNow18', { confirmed: true, adult: false, age: 17, dob: dobYearsAgo(18, 5), confirmedAt: Date.now() });
  assert.equal(await A.isAgeConfirmed('legacyNow18'), true);
});
await t('no record means not confirmed', async () => assert.equal(await A.isAgeConfirmed('nobody'), false));

console.log(`\n${pass}/${n} passed`);
if (pass !== n) process.exit(1);
