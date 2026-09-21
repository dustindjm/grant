import { json, readJson } from '../lib/http.mjs';
import { getSessionEmail } from '../lib/auth.mjs';
import { membershipTrust } from '../lib/members.mjs';
import { getOrder, publicOrder, checkRewriteQuota, bumpRewriteQuota, rewriteDailyLimit } from '../lib/orders.mjs';
import { upgradeDraftWithClaude } from '../lib/fulfill.mjs';

// Rewrites a draft properly with Claude. Reached by a member who previewed
// before paying, or by anyone retrying an order whose Claude call failed
// during checkout.
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const payload = await readJson(req);
  const orderId = payload?.orderId;
  if (!orderId || typeof orderId !== 'string') return json({ error: 'Missing orderId.' }, 400);

  const order = await getOrder(orderId);
  if (!order) return json({ error: 'That draft no longer exists.' }, 404);

  const sessionEmail = await getSessionEmail(req);
  const trust = sessionEmail ? await membershipTrust(sessionEmail) : null;

  // Two ways in. A session that provably belongs to a paying customer, or
  // possession of the id of an order somebody paid for — the same credential
  // /api/draft and the follow-up email link already rely on.
  const paidForThisDraft = !!order.paidAt;
  if (!trust && !paidForThisDraft) {
    return json({ error: 'Unlock this draft to generate the complete version.' }, 402);
  }

  // A logged-in caller may only touch their own drafts. Previously this check
  // was skipped entirely when there was no session, which let any caller
  // holding an id act on it unconditionally.
  if (sessionEmail) {
    const owns = sessionEmail === order.orgEmail || sessionEmail === order.accountEmail;
    if (!owns && !paidForThisDraft) {
      return json({ error: 'This draft belongs to another account.' }, 403);
    }
  }

  // Only a proven customer gets unlimited retries; everyone else is capped so
  // a known order id cannot be used to re-run Claude indefinitely.
  const metered = trust !== 'verified';
  if (metered) {
    const quota = await checkRewriteQuota(orderId);
    if (!quota.allowed) {
      return json(
        { error: `That's ${rewriteDailyLimit()} rewrites of this draft today. Try again tomorrow.`, limitReached: true },
        429
      );
    }
  }

  try {
    const before = order.engine;
    const updated = await upgradeDraftWithClaude(order);
    // Only count attempts that actually spent a Claude call. Re-requesting a
    // draft that is already written returns immediately and costs nothing.
    if (metered && updated.engine !== before) await bumpRewriteQuota(orderId);
    if (updated.upgradeError) return json({ error: updated.upgradeError }, 502);
    return json({ order: publicOrder(updated, { includeFull: true }) });
  } catch (err) {
    console.error('[upgrade-draft]', err);
    return json({ error: 'Could not rewrite this draft right now.' }, 500);
  }
};

export const config = { path: '/api/upgrade-draft' };
