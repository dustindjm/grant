import { json } from '../lib/http.mjs';
import { listOrders } from '../lib/orders.mjs';
import { listKeys, getJSON } from '../lib/store.mjs';
import { formatPrice, PLANS } from '../lib/plans.mjs';

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async (req) => {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return json({ error: 'ADMIN_PASSWORD is not set on the server.' }, 500);

  const provided = req.headers.get('x-admin-password') || '';
  if (!timingSafeEqual(provided, expected)) return json({ error: 'Incorrect password.' }, 401);

  try {
    const orders = await listOrders();
    const memberKeys = await listKeys('member:');
    const members = (await Promise.all(memberKeys.map((k) => getJSON(k)))).filter(Boolean);
    const active = members.filter((m) => m.status === 'active');

    const mrrCents = active
      .filter((m) => m.plan === 'monthly')
      .length * PLANS.monthly.amountCents;

    return json({
      orders: orders.map((o) => ({
        id: o.id,
        orgName: o.orgName,
        orgEmail: o.orgEmail,
        funderName: o.funderName,
        plan: o.plan,
        engine: o.engine,
        unlocked: !!o.unlocked,
        createdAt: o.createdAt,
        paidAt: o.paidAt || null,
        deadline: o.deadline || '',
        draft: o.draft,
        upgradeError: o.upgradeError || null
      })),
      members: active.map((m) => ({ email: m.email, plan: m.plan, activatedAt: m.activatedAt })),
      stats: {
        totalDrafts: orders.length,
        paidDrafts: orders.filter((o) => o.unlocked).length,
        activeMembers: active.length,
        lifetimeMembers: active.filter((m) => m.plan === 'lifetime').length,
        mrr: formatPrice(mrrCents)
      }
    });
  } catch (err) {
    console.error('[admin-orders]', err);
    return json({ error: 'Could not load the dashboard.' }, 500);
  }
};

export const config = { path: '/api/admin-orders' };
