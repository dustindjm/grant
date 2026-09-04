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
