/**
 * POST /api/wallet/nowpayments-ipn   (called by NOWPayments, not the browser)
 *
 * The ONLY place a crypto deposit credits CLU — and only after verifying the
 * IPN signature against NOWPAYMENTS_IPN_SECRET. Credits once the payment is
 * `finished` (fully paid); idempotent by payment_id, so NOWPayments' repeated
 * status callbacks can never double-credit. Zero-dependency (Node crypto).
 *
 * NOWPayments signs the IPN with HMAC-SHA512 over the JSON body serialized with
 * its keys sorted alphabetically, delivered in the `x-nowpayments-sig` header.
 *
 * Required env: NOWPAYMENTS_IPN_SECRET
 * Needs the RAW body for signature verification, so body parsing is off.
 */
import crypto from 'crypto';
import { creditDeposit, cluFromUsd, BalanceError } from '../_payments.js';

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

/**
 * Verify a NOWPayments IPN signature. Exported for unit testing.
 * Mirrors NOWPayments' own method: HMAC-SHA512 of JSON.stringify(body, sortedKeys).
 */
export function verifyNowPaymentsSignature(params, sigHeader, secret) {
  if (!sigHeader || !secret || !params || typeof params !== 'object') return false;
  const sorted = Object.keys(params).sort();
  const expected = crypto.createHmac('sha512', secret)
    .update(JSON.stringify(params, sorted))
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sigHeader));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) return res.status(503).json({ error: 'Crypto IPN not configured' });

  const raw = await readRawBody(req);
  let params;
  try {
    params = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  if (!verifyNowPaymentsSignature(params, req.headers['x-nowpayments-sig'], secret)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Only a fully-paid payment credits.
  if (params.payment_status !== 'finished') {
    return res.status(200).json({ ignored: params.payment_status });
  }

  const userId = params.order_id;
  const usd = parseFloat(params.price_amount);
  const clu = cluFromUsd(usd);
  if (!userId || !(clu > 0)) {
    console.error('[nowpayments-ipn] missing order_id or zero amount', params.payment_id);
    return res.status(200).json({ ignored: 'missing order_id or amount' });
  }

  try {
    const result = await creditDeposit({
      userId, provider: 'nowpayments', ref: String(params.payment_id), clu,
      meta: { usd, payCurrency: params.pay_currency, payAmount: params.pay_amount },
    });
    return res.status(200).json({ credited: result.credited, duplicate: result.duplicate || false });
  } catch (e) {
    if (e instanceof BalanceError) console.error('[nowpayments-ipn] credit BalanceError', e.code);
    // 5xx → NOWPayments retries; the SET NX claim prevents a double credit.
    return res.status(500).json({ error: 'Credit failed — will retry' });
  }
}
