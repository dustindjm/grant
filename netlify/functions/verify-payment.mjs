import { json, readJson } from '../lib/http.mjs';
import { retrieveCheckoutSession } from '../lib/stripe.mjs';
import { fulfillCheckout } from '../lib/fulfill.mjs';
import { publicOrder } from '../lib/orders.mjs';
import { isValidEmail } from '../lib/store.mjs';
import { createSession, sessionCookie } from '../lib/auth.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!process.env.STRIPE_SECRET_KEY) return json({ error: 'Payments are not configured.' }, 500);

  const payload = await readJson(req);
  const sessionId = payload?.session_id;
  if (!sessionId || typeof sessionId !== 'string') return json({ error: 'Missing session_id.' }, 400);

  try {
    const session = await retrieveCheckoutSession(sessionId);
    const paid = session.payment_status === 'paid' || session.status === 'complete';
    if (!paid) return json({ paid: false, status: session.payment_status || session.status });

    const { order, email, plan } = await fulfillCheckout(session);

    // Holding this Stripe session id is proof of having completed the
    // checkout — it comes back only in Stripe's own redirect. That is the
    // one unforgeable signal available, so it is the moment to hand the
    // buyer a real session. From here on their entitlement rides on a
    // cookie they were issued for paying, not on an email address anyone
    // can type into the form.
    const headers = {};
    if (isValidEmail(email)) {
      headers['Set-Cookie'] = sessionCookie(await createSession(email));
    }

    return json({
      paid: true,
      plan,
      email,
      signedIn: !!headers['Set-Cookie'],
      order: order ? publicOrder(order, { includeFull: true }) : null,
      upgradeError: order?.upgradeError || null
    }, 200, headers);
  } catch (err) {
    console.error('[verify-payment]', err);
    return json({ paid: false, error: 'Could not verify this payment.' }, 502);
  }
};

export const config = { path: '/api/verify-payment' };
