import { json } from '../lib/http.mjs';
import { getSessionEmail } from '../lib/auth.mjs';
import { getMember } from '../lib/members.mjs';
import { publicPlans } from '../lib/plans.mjs';
import { getEmailUsage, freePreviewLimit } from '../lib/orders.mjs';

export default async (req) => {
  const email = await getSessionEmail(req);
  const member = email ? await getMember(email) : null;
  const used = email ? await getEmailUsage(email) : 0;

  return json({
    loggedIn: !!email,
    email: email || null,
    member: !!member,
    plan: member?.plan || null,
    plans: publicPlans(),
    freePreviewLimit: freePreviewLimit(),
    freePreviewsRemaining: email ? Math.max(0, freePreviewLimit() - used) : null
  });
};

export const config = { path: '/api/me' };
