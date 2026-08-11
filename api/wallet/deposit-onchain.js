/**
 * POST /api/wallet/deposit-onchain
 * Body: { txHash }
 *
 * Credits CLU for a REAL on-chain deposit. The server independently reads the
 * transaction from an RPC node and only credits if it is a confirmed transfer
 * of the configured token, FROM the authenticated user's own wallet, TO the
 * platform deposit address. Idempotent by txHash.
 *
 * Required env:
 *   EVM_RPC_URL             RPC endpoint (e.g. an Alchemy/Infura URL)
 *   DEPOSIT_ADDRESS         platform receiving address
 *   DEPOSIT_TOKEN           'native' or an ERC-20 contract address
 * Optional env:
 *   EVM_CHAIN_ID            expected chain id (enforced if set)
 *   DEPOSIT_TOKEN_DECIMALS  default 18
 *   DEPOSIT_TOKEN_USD       USD per 1 token (default 1 — for a USD stablecoin)
 *   MIN_CONFIRMATIONS       default 3
 *   CLU_USD_RATE            USD per 1 CLU (default 0.10)
 */
import { ethers } from 'ethers';
import { requireAuth } from '../_auth.js';
import { creditDeposit, cluFromUsd, BalanceError } from '../_payments.js';

const TRANSFER_TOPIC = ethers.id('Transfer(address,uint256)');

function config() {
  return {
    rpc: process.env.EVM_RPC_URL,
    depositAddress: process.env.DEPOSIT_ADDRESS,
    token: process.env.DEPOSIT_TOKEN, // 'native' | erc20 address
    chainId: process.env.EVM_CHAIN_ID ? BigInt(process.env.EVM_CHAIN_ID) : null,
    decimals: parseInt(process.env.DEPOSIT_TOKEN_DECIMALS || '18'),
    tokenUsd: parseFloat(process.env.DEPOSIT_TOKEN_USD || '1'),
    minConf: parseInt(process.env.MIN_CONFIRMATIONS || '3'),
  };
}

const eq = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const user = requireAuth(req, res);
  if (!user) return;
  if (!user.addr) return res.status(400).json({ error: 'On-chain deposit requires a wallet-linked account' });

  const cfg = config();
  if (!cfg.rpc || !cfg.depositAddress || !cfg.token) {
    return res.status(503).json({ error: 'On-chain deposits are not configured' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const txHash = (body.txHash || '').trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return res.status(400).json({ error: 'Invalid txHash' });
  }

  const provider = new ethers.JsonRpcProvider(cfg.rpc);

  try {
    if (cfg.chainId !== null) {
      const net = await provider.getNetwork();
      if (net.chainId !== cfg.chainId) {
        return res.status(400).json({ error: `Wrong chain (expected ${cfg.chainId}, got ${net.chainId})` });
      }
    }

    const [tx, receipt] = await Promise.all([
      provider.getTransaction(txHash),
      provider.getTransactionReceipt(txHash),
    ]);
    if (!tx || !receipt) return res.status(400).json({ error: 'Transaction not found or not yet mined' });
    if (receipt.status !== 1) return res.status(400).json({ error: 'Transaction failed on-chain' });

    const current = await provider.getBlockNumber();
    const confirmations = current - receipt.blockNumber + 1;
    if (confirmations < cfg.minConf) {
      return res.status(400).json({ error: `Needs ${cfg.minConf} confirmations, has ${confirmations}` });
    }

    // Determine the amount transferred to the deposit address FROM this user.
    let rawAmount = null;
    if (cfg.token === 'native') {
      if (!eq(tx.from, user.addr)) return res.status(403).json({ error: 'Deposit not sent from your wallet' });
      if (!eq(tx.to, cfg.depositAddress)) return res.status(400).json({ error: 'Deposit not sent to the platform address' });
      rawAmount = tx.value; // bigint (wei)
    } else {
      for (const log of receipt.logs) {
        if (!eq(log.address, cfg.token)) continue;
        if (log.topics[0] !== TRANSFER_TOPIC) continue;
        const from = ethers.getAddress('0x' + log.topics[1].slice(26));
        const to = ethers.getAddress('0x' + log.topics[2].slice(26));
        if (eq(from, user.addr) && eq(to, cfg.depositAddress)) {
          rawAmount = BigInt(log.data);
          break;
        }
      }
      if (rawAmount === null) {
        return res.status(400).json({ error: 'No matching token transfer to the platform address from your wallet' });
      }
    }

    const tokenAmount = Number(ethers.formatUnits(rawAmount, cfg.decimals));
    const usd = tokenAmount * cfg.tokenUsd;
    const clu = cluFromUsd(usd);
    if (clu <= 0) return res.status(400).json({ error: 'Deposit amount too small to credit' });

    const result = await creditDeposit({
      userId: user.userId,
      provider: 'onchain',
      ref: txHash,
      clu,
      meta: { token: cfg.token, tokenAmount, usd, from: user.addr },
    });

    if (result.duplicate) {
      return res.status(200).json({ credited: false, duplicate: true, message: 'This transaction was already credited' });
    }
    return res.status(200).json({ credited: true, clu: result.clu, available: result.available, txHash });
  } catch (e) {
    if (e instanceof BalanceError) return res.status(409).json({ error: `Credit failed (${e.code})` });
    console.error('[deposit-onchain]', e);
    return res.status(502).json({ error: 'Failed to verify the on-chain transaction' });
  }
}
