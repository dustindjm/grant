import { json } from '../lib/http.mjs';
import { getSessionEmail } from '../lib/auth.mjs';
import { getMember, membershipTrust } from '../lib/members.mjs';
import { publicPlans } from '../lib/plans.mjs';
import {
  getEmailUsage,
  freePreviewLimit,
  checkUnverifiedFullQuota,
  unverifiedFullDailyLimit
} from '../lib/orders.mjs';

export default async (req) => {
  const email = await getSessionEmail(req);
  const member = email ? await getMember(email) : null;
  const trust = email ? await membershipTrust(email) : null;
  const used = email ? await getEmailUsage(email) : 0;

  // A membership this session cannot prove it owns still works, but it is
  // capped. Say so, rather than showing "full access" and then refusing at
  // the tenth draft with no warning.
  let fullDraftsRemaining = null;
  if (member && trust !== 'verified') {
    const quota = await checkUnverifiedFullQuota(email);
    fullDraftsRemaining = Math.max(0, unverifiedFullDailyLimit() - quota.count);
  }

  return json({
    loggedIn: !!email,
    email: email || null,
    member: !!member,
    verified: trust === 'verified',
    plan: member?.plan || null,
    plans: publicPlans(),
    freePreviewLimit: freePreviewLimit(),
    freePreviewsRemaining: email ? Math.max(0, freePreviewLimit() - used) : null,
    fullDraftDailyLimit: unverifiedFullDailyLimit(),
    fullDraftsRemaining
  });
};

export const config = { path: '/api/me' };
