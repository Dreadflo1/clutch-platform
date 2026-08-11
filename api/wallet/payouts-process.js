/**
 * POST /api/wallet/payouts-process   (ops/worker — secret-gated)
 *
 * Drains payouts:pending and executes the outbound transfer for each:
 *   - onchain: signs & broadcasts the transfer from the platform hot wallet
 *   - stripe : parked as manual_required (fiat payout needs Stripe Connect)
 * On a send failure the debited CLU is refunded, so a user never loses funds
 * that never left the platform. Idempotent per payout via a lock + status gate.
 *
 * Moves real money, so it is secret-gated and refuses to run in prod without it.
 * Not on a cron by default — trigger it deliberately (or add your own cron that
 * sends `Authorization: Bearer <PAYOUT_SECRET>`).
 *
 * Required env for on-chain sends:
 *   PAYOUT_SECRET, EVM_RPC_URL, PAYOUT_PRIVATE_KEY, DEPOSIT_TOKEN
 * Optional: DEPOSIT_TOKEN_DECIMALS, DEPOSIT_TOKEN_USD, CLU_USD_RATE,
 *           PAYOUT_MAX_CLU (auto-send cap; larger payouts are parked), BATCH
 */
import { ethers } from 'ethers';
import { kvLock, kvUnlock } from '../_kv.js';
import {
  getPendingPayoutIds, getPayout, claimPayout, markPayoutSent,
  markPayoutManual, failPayoutAndRefund, usdFromClu,
} from '../_payments.js';

const IS_PROD =
  process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

function authorize(req, res) {
  const secret = process.env.PAYOUT_SECRET;
  if (!secret) {
    if (IS_PROD) { res.status(503).json({ error: 'Payout worker not configured (PAYOUT_SECRET unset)' }); return false; }
    return true;
  }
  if (req.headers.authorization !== `Bearer ${secret}`) { res.status(401).json({ error: 'Unauthorized' }); return false; }
  return true;
}

function onchainConfig() {
  return {
    rpc: process.env.EVM_RPC_URL,
    key: process.env.PAYOUT_PRIVATE_KEY,
    token: process.env.DEPOSIT_TOKEN,
    decimals: parseInt(process.env.DEPOSIT_TOKEN_DECIMALS || '18'),
    tokenUsd: parseFloat(process.env.DEPOSIT_TOKEN_USD || '1'),
    maxClu: parseInt(process.env.PAYOUT_MAX_CLU || '50000'),
  };
}

async function sendOnchain(payout, cfg) {
  const provider = new ethers.JsonRpcProvider(cfg.rpc);
  const wallet = new ethers.Wallet(cfg.key, provider);
  const tokenAmount = usdFromClu(payout.clu) / cfg.tokenUsd;
  const raw = ethers.parseUnits(tokenAmount.toFixed(cfg.decimals), cfg.decimals);

  if (cfg.token === 'native') {
    const tx = await wallet.sendTransaction({ to: payout.destination, value: raw });
    return tx.hash;
  }
  const erc20 = new ethers.Contract(cfg.token, ['function transfer(address,uint256) returns (bool)'], wallet);
  const tx = await erc20.transfer(payout.destination, raw);
  return tx.hash;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'POST only' });
  if (!authorize(req, res)) return;

  const cfg = onchainConfig();
  const batch = Math.min(parseInt(process.env.BATCH || '20'), 50);
  const ids = await getPendingPayoutIds(batch);
  const result = { scanned: ids.length, sent: 0, refunded: 0, manual: 0, skipped: 0 };

  for (const id of ids) {
    const lockKey = `lock:payout:${id}`;
    if (!(await kvLock(lockKey, 30))) { result.skipped++; continue; }
    try {
      const payout = await getPayout(id);
      if (!payout || payout.status !== 'pending') { result.skipped++; continue; }

      if (payout.rail === 'stripe') {
        await markPayoutManual(payout, 'Stripe payout requires Connect — fulfil off-platform');
        result.manual++;
        continue;
      }

      // on-chain
      if (!cfg.rpc || !cfg.key || !cfg.token) { result.skipped++; continue; } // leave pending
      if (payout.clu > cfg.maxClu) {
        await markPayoutManual(payout, `exceeds auto-payout cap (${cfg.maxClu} CLU)`);
        result.manual++;
        continue;
      }

      await claimPayout(payout);
      try {
        const txHash = await sendOnchain(payout, cfg);
        await markPayoutSent(payout, txHash);
        result.sent++;
      } catch (e) {
        console.error(`[payouts-process] send failed for ${id}:`, e?.message || e);
        await failPayoutAndRefund(payout, e?.shortMessage || e?.message || 'send_failed');
        result.refunded++;
      }
    } catch (e) {
      console.error(`[payouts-process] error on ${id}:`, e?.message || e);
    } finally {
      await kvUnlock(lockKey);
    }
  }

  return res.status(200).json({ ok: true, processedAt: new Date().toISOString(), ...result });
}
