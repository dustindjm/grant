import { json } from '../lib/http.mjs';
import { getSessionEmail } from '../lib/auth.mjs';
import { getOrderIdsForEmail, getOrder, publicOrder } from '../lib/orders.mjs';

export default async (req) => {
  const email = await getSessionEmail(req);
  if (!email) return json({ error: 'Log in to see your saved drafts.' }, 401);

  try {
    const ids = await getOrderIdsForEmail(email);
    const orders = await Promise.all(ids.slice(-100).map((id) => getOrder(id)));
    const drafts = orders
      .filter(Boolean)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((o) => publicOrder(o));
    return json({ drafts });
  } catch (err) {
    console.error('[my-drafts]', err);
    return json({ error: 'Could not load your drafts.' }, 500);
  }
};

export const config = { path: '/api/my-drafts' };
