import { json, siteUrl } from '../lib/http.mjs';
import { getSessionEmail } from '../lib/auth.mjs';
import { getMember } from '../lib/members.mjs';
import { createBillingPortalSession } from '../lib/stripe.mjs';

// Lets subscribers manage or cancel their plan without emailing you.
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const email = await getSessionEmail(req);
  if (!email) return json({ error: 'Log in first.' }, 401);

  const member = await getMember(email);
  if (!member?.stripeCustomerId) {
    return json({ error: 'No Stripe subscription is linked to this account.' }, 404);
  }

  try {
    const session = await createBillingPortalSession({
      customer: member.stripeCustomerId,
      return_url: `${siteUrl(req)}/`
    });
    return json({ url: session.url });
  } catch (err) {
    console.error('[billing-portal]', err);
    return json({ error: err.message || 'Could not open the billing portal.' }, 502);
  }
};

export const config = { path: '/api/billing-portal' };
