/**
 * POST /api/wallet/stripe-checkout
 * Body: { usd }  (auth required)
 *
 * Creates a Stripe Checkout Session for a fiat deposit and returns its URL. No
 * balance is credited here — crediting happens only when Stripe confirms payment
 * via the webhook (see stripe-webhook.js). Zero-dependency: talks to the Stripe
 * REST API directly.
 *
 * Required env: STRIPE_SECRET_KEY
 * Optional env: STRIPE_SUCCESS_URL, STRIPE_CANCEL_URL, CLU_USD_RATE
 */
import { requireAuth } from '../_auth.js';
import { cluFromUsd } from '../_payments.js';

const MIN_USD = 1;
const MAX_USD = 500;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const user = requireAuth(req, res);
  if (!user) return;

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return res.status(503).json({ error: 'Stripe deposits are not configured' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const usd = Math.round(parseFloat(body.usd) * 100) / 100;
  if (isNaN(usd) || usd < MIN_USD || usd > MAX_USD) {
    return res.status(400).json({ error: `usd must be ${MIN_USD}-${MAX_USD}` });
  }

  const origin = req.headers.origin || `https://${req.headers.host || ''}`;
  const successUrl = process.env.STRIPE_SUCCESS_URL || `${origin}/?deposit=success`;
  const cancelUrl = process.env.STRIPE_CANCEL_URL || `${origin}/?deposit=cancelled`;

  // Form-encode the Checkout Session params for the Stripe REST API.
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('client_reference_id', user.userId);
  params.set('metadata[userId]', user.userId);
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'usd');
  params.set('line_items[0][price_data][unit_amount]', String(Math.round(usd * 100)));
  params.set('line_items[0][price_data][product_data][name]', `${cluFromUsd(usd)} CLU deposit`);

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('[stripe-checkout]', data.error?.message);
      return res.status(502).json({ error: 'Failed to create checkout session' });
    }
    return res.status(200).json({ url: data.url, sessionId: data.id, clu: cluFromUsd(usd) });
  } catch (e) {
    console.error('[stripe-checkout]', e);
    return res.status(502).json({ error: 'Failed to reach Stripe' });
  }
}
