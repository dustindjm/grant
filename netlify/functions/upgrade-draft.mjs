import { json, readJson } from '../lib/http.mjs';
import { getSessionEmail } from '../lib/auth.mjs';
import { isMember } from '../lib/members.mjs';
import { getOrder, publicOrder } from '../lib/orders.mjs';
import { upgradeDraftWithClaude } from '../lib/fulfill.mjs';

// A member who previewed a draft before paying (or whose Claude call failed
// during checkout) can rewrite it properly here.
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const payload = await readJson(req);
  const orderId = payload?.orderId;
  if (!orderId || typeof orderId !== 'string') return json({ error: 'Missing orderId.' }, 400);

  const order = await getOrder(orderId);
  if (!order) return json({ error: 'That draft no longer exists.' }, 404);

  const sessionEmail = await getSessionEmail(req);
  // Either an active member, or someone who already paid for this one draft.
  const member = (await isMember(order.orgEmail)) || (sessionEmail ? await isMember(sessionEmail) : false);
  const paidForThisDraft = !!order.paidAt;
  if (!member && !paidForThisDraft) {
    return json({ error: 'Unlock this draft to generate the complete version.' }, 402);
  }

  // Only the owner of the draft can rewrite it.
  const owns = sessionEmail === order.orgEmail || sessionEmail === order.accountEmail || !sessionEmail;
  if (sessionEmail && !owns) return json({ error: 'This draft belongs to another account.' }, 403);

  try {
    const updated = await upgradeDraftWithClaude(order);
    if (updated.upgradeError) return json({ error: updated.upgradeError }, 502);
    return json({ order: publicOrder(updated, { includeFull: true }) });
  } catch (err) {
    console.error('[upgrade-draft]', err);
    return json({ error: 'Could not rewrite this draft right now.' }, 500);
  }
};

export const config = { path: '/api/upgrade-draft' };
