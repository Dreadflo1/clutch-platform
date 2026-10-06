/**
 * Account creation, shared by every sign-in path (email, Telegram, MetaMask,
 * OAuth). The starting balance is written with SET NX, so it can only ever be
 * created once: a retried or concurrent first login can never reset an existing
 * balance (which would wipe escrow and re-grant the free CLU).
 */
import { kvSet, kvSetNx } from './_kv.js';
import { registerAccount, STARTING_GRANT } from './_registry.js';

/**
 * Create the user record and starting balance for a brand-new account.
 * @returns {Promise<boolean>} true if this call created the balance
 */
export async function createAccount(userId, user, { via, req = null, ref = null } = {}) {
  await kvSet(userId, user);
  const created = await kvSetNx(`bal:${userId}`, { available: STARTING_GRANT, escrow: 0, version: 1 });
  if (created) await kvSetNx(`txlog:${userId}`, []);
  await registerAccount(userId, { via, req, ref });
  return created;
}
