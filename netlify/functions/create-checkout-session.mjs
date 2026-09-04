import { json, readJson, siteUrl } from '../lib/http.mjs';
import { normalizeEmail, isValidEmail } from '../lib/store.mjs';
import { getPlan } from '../lib/plans.mjs';
import { createCheckoutSession } from '../lib/stripe.mjs';
import { getOrder } from '../lib/orders.mjs';
import { getSessionEmail } from '../lib/auth.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!process.env.STRIPE_SECRET_KEY) {
    return json({ error: 'Payments are not configured yet. Set STRIPE_SECRET_KEY in Netlify.' }, 500);
  }

  const payload = await readJson(req);
  if (!payload) return json({ error: 'Invalid request body.' }, 400);

  const plan = getPlan(payload.plan);
  const orderId = typeof payload.orderId === 'string' ? payload.orderId.slice(0, 64) : '';
  const order = orderId ? await getOrder(orderId) : null;

  const sessionEmail = await getSessionEmail(req);
  const email = normalizeEmail(payload.email || order?.orgEmail || sessionEmail || '');
  const base = siteUrl(req);

  // Use a real Stripe Price if one is configured, otherwise build the price
  // inline so the site works with nothing but a secret key.
  const configuredPrice = process.env[plan.stripePriceEnv];
  const lineItem = configuredPrice
    ? { price: configuredPrice, quantity: 1 }
    : {
        price_data: {
          currency: process.env.CURRENCY || 'usd',
          product_data: { name: plan.name },
          unit_amount: plan.amountCents,
          ...(plan.mode === 'subscription' ? { recurring: { interval: 'month' } } : {})
        },
        quantity: 1
      };

  const params = {
    mode: plan.mode,
    line_items: [lineItem],
    client_reference_id: orderId || undefined,
    metadata: { orderId: orderId || '', plan: plan.id, orgEmail: email || '' },
    allow_promotion_codes: true,
    success_url: `${base}/?paid=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/?paid=false`
  };

  if (isValidEmail(email)) params.customer_email = email;
  if (plan.mode === 'subscription') {
    params.subscription_data = { metadata: { orderId: orderId || '', orgEmail: email || '' } };
  } else {
    params.payment_intent_data = { metadata: { orderId: orderId || '', orgEmail: email || '' } };
  }

  try {
    const session = await createCheckoutSession(params);
    if (!session.url) return json({ error: 'Stripe did not return a checkout link.' }, 502);
    return json({ url: session.url });
  } catch (err) {
    console.error('[create-checkout-session]', err);
    return json({ error: err.message || 'Could not start checkout.' }, 502);
  }
};

export const config = { path: '/api/create-checkout-session' };
