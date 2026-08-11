/**
 * POST /api/wallet/nowpayments-create
 * Body: { usd }  (auth required)
 *
 * Creates a NOWPayments hosted invoice for a crypto deposit and returns its URL.
 * No balance is credited here — crediting happens only when NOWPayments confirms
 * payment via the signed IPN (see nowpayments-ipn.js). The user's id rides along
 * as order_id so the IPN knows who to credit.
 *
 * Required env: NOWPAYMENTS_API_KEY
 * Optional env: NOWPAYMENTS_SUCCESS_URL, NOWPAYMENTS_CANCEL_URL, CLU_USD_RATE
 */
import { requireAuth } from '../_auth.js';
import { cluFromUsd } from '../_payments.js';

const MIN_USD = 1;
const MAX_USD = 500;
const API = 'https://api.nowpayments.io/v1/invoice';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const user = requireAuth(req, res);
  if (!user) return;

  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Crypto deposits are not configured' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const usd = Math.round(parseFloat(body.usd) * 100) / 100;
  if (isNaN(usd) || usd < MIN_USD || usd > MAX_USD) {
    return res.status(400).json({ error: `usd must be ${MIN_USD}-${MAX_USD}` });
  }

  const origin = req.headers.origin || `https://${req.headers.host || ''}`;
  const payload = {
    price_amount: usd,
    price_currency: 'usd',
    order_id: user.userId,
    order_description: `${cluFromUsd(usd)} CLU deposit`,
    ipn_callback_url: `${origin}/api/wallet/nowpayments-ipn`,
    success_url: process.env.NOWPAYMENTS_SUCCESS_URL || `${origin}/?deposit=success`,
    cancel_url: process.env.NOWPAYMENTS_CANCEL_URL || `${origin}/?deposit=cancelled`,
  };

  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('[nowpayments-create]', data?.message || r.status);
      return res.status(502).json({ error: 'Failed to create crypto invoice' });
    }
    return res.status(200).json({ url: data.invoice_url, invoiceId: data.id, clu: cluFromUsd(usd) });
  } catch (e) {
    console.error('[nowpayments-create]', e);
    return res.status(502).json({ error: 'Failed to reach payment provider' });
  }
}
