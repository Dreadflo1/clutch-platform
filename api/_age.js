/**
 * Age gate — two tiers:
 *   16–17  → can register and play/rank on the FREE (non-cashable) balance.
 *   18+    → everything, plus real money (deposit / withdraw / cash-out).
 *
 * The user confirms a date of birth once; we store `age:{userId}` = { confirmed,
 * adult, age, dob }. Money endpoints require `adult` (18+); registration and
 * staked duels require `confirmed` (16+). Self-declared for MVP — hard proof
 * (Stripe Identity, phone-camera ID + DOB, no raw IDs stored by us) plugs in at
 * cash-out later.
 */
import { kvGet, kvSet } from './_kv.js';

export const MIN_AGE = 16;    // minimum to register / play
export const ADULT_AGE = 18;  // minimum for real money

/** Whole years from a YYYY-MM-DD (or parseable date) to now; null if invalid. */
export function ageFromDob(dob) {
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  if (d > now) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

/** Record a confirmed DOB (16+), flagging whether they're an adult (18+). */
export async function confirmAge(userId, dob) {
  const age = ageFromDob(dob);
  if (age === null) return { ok: false, error: 'invalid_dob' };
  if (age < MIN_AGE) return { ok: false, error: 'under_min', age };
  const adult = age >= ADULT_AGE;
  await kvSet(`age:${userId}`, { confirmed: true, adult, age, dob: String(dob).slice(0, 10), confirmedAt: Date.now() });
  return { ok: true, adult, age };
}

export async function ageStatus(userId) {
  const rec = await kvGet(`age:${userId}`);
  return { confirmed: Boolean(rec && rec.confirmed), adult: Boolean(rec && rec.adult) };
}

/** 16+ confirmed — may register and play. */
export async function isAgeConfirmed(userId) {
  return (await ageStatus(userId)).confirmed;
}

/** 18+ — may move real money. */
export async function isAdult(userId) {
  return (await ageStatus(userId)).adult;
}
