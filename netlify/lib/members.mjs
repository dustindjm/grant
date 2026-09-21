import { getJSON, setJSON, remove, normalizeEmail } from './store.mjs';

// A "member" is any email that has an active paid entitlement, whether that
// came from a monthly subscription or a one-time lifetime purchase.

export async function getMember(email) {
  const key = normalizeEmail(email);
  if (!key) return null;

  if (process.env.TEST_UNLOCK_EMAIL && key === normalizeEmail(process.env.TEST_UNLOCK_EMAIL)) {
    return { email: key, plan: 'lifetime', status: 'active', test: true };
  }

  const record = await getJSON(`member:${key}`);
  if (!record) return null;
  if (record.status && record.status !== 'active') return null;
  return record;
}

export async function isMember(email) {
  return !!(await getMember(email));
}

// How much a logged-in session's membership can be trusted.
//
//   'verified' — the session provably belongs to the person who paid.
//   'claimed'  — plausible, but an account was registered for this address
//                after the membership existed, and nothing proved ownership
//                of the address. That is what an account takeover looks
//                like, and also what a genuine customer returning to sign
//                up looks like; they are not distinguishable without email
//                verification. Treated as the metered tier rather than
//                refused, so a real customer is never locked out.
//   null       — not a member.
export async function membershipTrust(email) {
  const member = await getMember(email);
  if (!member) return null;
  if (member.test) return 'verified';

  const key = normalizeEmail(email);
  const account = await getJSON(`account:${key}`);

  // No account at all means the session was minted against a completed
  // Stripe checkout, which is proof of purchase.
  if (!account) return 'verified';
  if (account.emailVerified) return 'verified';

  // Registered before the membership existed, then paid: the ordinary path.
  if ((account.createdAt || 0) <= (member.activatedAt || 0)) return 'verified';

  return 'claimed';
}

export async function activateMember(email, plan, stripe = {}) {
  const key = normalizeEmail(email);
  if (!key) return null;

  const existing = (await getJSON(`member:${key}`)) || {};
  const record = {
    ...existing,
    email: key,
    plan: plan || existing.plan || 'monthly',
    status: 'active',
    activatedAt: existing.activatedAt || Date.now(),
    updatedAt: Date.now(),
    stripeCustomerId: stripe.customerId || existing.stripeCustomerId || null,
    stripeSubscriptionId: stripe.subscriptionId || existing.stripeSubscriptionId || null
  };
  await setJSON(`member:${key}`, record);

  // Reverse lookups so Stripe webhooks can find the member later.
  if (record.stripeCustomerId) await setJSON(`stripecustomer:${record.stripeCustomerId}`, { email: key });
  if (record.stripeSubscriptionId) await setJSON(`stripesub:${record.stripeSubscriptionId}`, { email: key });

  return record;
}

export async function deactivateMember(email, reason = 'canceled') {
  const key = normalizeEmail(email);
  if (!key) return null;
  const record = await getJSON(`member:${key}`);
  if (!record) return null;
  if (record.plan === 'lifetime') return record; // lifetime access is not revoked by a subscription event

  const updated = { ...record, status: reason, updatedAt: Date.now() };
  await setJSON(`member:${key}`, updated);
  return updated;
}

export async function emailForStripeSubscription(subscriptionId) {
  if (!subscriptionId) return null;
  const rec = await getJSON(`stripesub:${subscriptionId}`);
  return rec?.email || null;
}

export async function emailForStripeCustomer(customerId) {
  if (!customerId) return null;
  const rec = await getJSON(`stripecustomer:${customerId}`);
  return rec?.email || null;
}

export async function forgetMember(email) {
  await remove(`member:${normalizeEmail(email)}`);
}
