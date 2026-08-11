/**
 * POST /api/wallet/stripe-webhook   (called by Stripe, not the browser)
 *
 * The ONLY place a Stripe deposit credits CLU — and only after verifying the
 * event's signature against STRIPE_WEBHOOK_SECRET. Idempotent by session id, so
 * Stripe's automatic retries can never double-credit. Zero-dependency: verifies
 * the signature with Node crypto instead of the Stripe SDK.
 *
 * Required env: STRIPE_WEBHOOK_SECRET
 *
 * Needs the RAW request body for signature verification, so body parsing is off.
 */
import crypto from 'crypto';
import { creditDeposit, cluFromUsd, BalanceError } from '../_payments.js';

export const config = { api: { bodyParser: false } };

const SIG_TOLERANCE_SEC = 300; // 5 min

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Verify a Stripe webhook signature. Exported for unit testing.
 * @returns {boolean}
 */
export function verifyStripeSignature(rawBody, sigHeader, secret, nowSec = Math.floor(Date.now() / 1000)) {
  if (!sigHeader || !secret) return false;
  const parts = {};
  for (const kv of sigHeader.split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i)] = kv.slice(i + 1);
  }
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(nowSec - Number(t)) > SIG_TOLERANCE_SEC) return false;

  const payload = `${t}.${Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: 'Stripe webhook not configured' });

  const raw = await readRawBody(req);
  const sig = req.headers['stripe-signature'];
  if (!verifyStripeSignature(raw, sig, secret)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    if (s.payment_status !== 'paid') return res.status(200).json({ ignored: 'not paid' });

    const userId = s.client_reference_id || s.metadata?.userId;
    const usd = (s.amount_total || 0) / 100;
    const clu = cluFromUsd(usd);
    if (!userId || clu <= 0) {
      console.error('[stripe-webhook] missing userId or zero amount', s.id);
      return res.status(200).json({ ignored: 'missing userId or amount' });
    }

    try {
      const result = await creditDeposit({
        userId, provider: 'stripe', ref: s.id, clu,
        meta: { usd, paymentIntent: s.payment_intent },
      });
      return res.status(200).json({ credited: result.credited, duplicate: result.duplicate || false });
    } catch (e) {
      // 5xx → Stripe retries. The SET NX claim means a retry won't double-credit.
      if (e instanceof BalanceError) console.error('[stripe-webhook] credit BalanceError', e.code);
      return res.status(500).json({ error: 'Credit failed — will retry' });
    }
  }

  // Acknowledge everything else so Stripe stops resending.
  return res.status(200).json({ received: true });
}
