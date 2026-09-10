import { json } from '../lib/http.mjs';
import { getOrder, publicOrder } from '../lib/orders.mjs';

// Lets the follow-up email link straight back to a saved draft. The id is a
// random UUID, so knowing it is the only credential needed — and it returns
// the preview text, never the paid full draft, unless that order was paid for.
export default async (req) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'Missing draft id.' }, 400);

  const order = await getOrder(id);
  if (!order) return json({ error: 'That draft no longer exists.' }, 404);

  return json({ order: publicOrder(order) });
};

export const config = { path: '/api/draft' };
