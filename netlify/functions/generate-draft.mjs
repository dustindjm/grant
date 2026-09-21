import { json, readJson, clientIp } from '../lib/http.mjs';
import { isValidEmail, normalizeEmail } from '../lib/store.mjs';
import { isMember, membershipTrust } from '../lib/members.mjs';
import { getSessionEmail } from '../lib/auth.mjs';
import { getGrantPoints } from '../lib/grant-library.mjs';
import { generatePreview, generateFull, truncateForPreview, MAX_RFP_CHARS } from '../lib/ai.mjs';
import {
  saveOrder,
  indexOrderForEmail,
  getEmailUsage,
  bumpEmailUsage,
  freePreviewLimit,
  checkIpQuota,
  bumpIpQuota,
  checkUnverifiedFullQuota,
  bumpUnverifiedFullQuota,
  unverifiedFullDailyLimit
} from '../lib/orders.mjs';

const REQUEST_TYPES = new Set([
  'Not specified / unclear',
  'General operating support',
  'Program or project support',
  'Capacity building',
  'Capital or equipment'
]);

function clean(value, max = 400) {
  return String(value ?? '').trim().slice(0, max);
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const payload = await readJson(req);
  if (!payload) return json({ error: 'Invalid request body.' }, 400);

  const input = {
    orgName: clean(payload.orgName, 200),
    orgEmail: normalizeEmail(payload.orgEmail),
    funderName: clean(payload.funderName, 200),
    rfpText: String(payload.rfpText ?? '').trim().slice(0, MAX_RFP_CHARS),
    orgMission: clean(payload.orgMission, 2000),
    progName: clean(payload.progName, 200),
    requestType: REQUEST_TYPES.has(payload.requestType) ? payload.requestType : 'Not specified / unclear',
    amount: clean(payload.amount, 60),
    deadline: clean(payload.deadline, 40),
    outcomes: clean(payload.outcomes, 3000),
    plan: payload.plan === 'lifetime' ? 'lifetime' : 'monthly'
  };

  if (!input.orgName || !input.funderName || !input.rfpText) {
    return json({ error: "Add your organization name, the funder's name, and their guidelines." }, 400);
  }
  if (!isValidEmail(input.orgEmail)) {
    return json({ error: 'Enter a valid contact email so you can find this draft later.' }, 400);
  }
  if (input.rfpText.length < 60) {
    return json({ error: 'Paste more of the funder guidelines — at least a couple of sentences to work from.' }, 400);
  }

  try {
    // Two ways to be a member, and they are not equally trustworthy.
    //
    // A session cookie is proof: it is issued at checkout, against a Stripe
    // session id only the buyer can hold. That path stays unmetered.
    //
    // A contact email typed into this form proves nothing — it is a plain
    // request field, and a paying organization's address is usually on its
    // website. Honouring it is what keeps customers who paid before sessions
    // existed working, so it stays, but it is metered per email per day and
    // counts against the same per-IP cap as the free tier. That bounds what
    // a known customer address is worth to someone who is not that customer.
    const sessionEmail = await getSessionEmail(req);
    const trust = sessionEmail ? await membershipTrust(sessionEmail) : null;
    const verifiedMember = trust === 'verified';
    // A session whose ownership was never proved gets the same metered tier
    // as a bare typed-in address, not the unmetered one.
    const claimedMember = !verifiedMember && (trust === 'claimed' || (await isMember(input.orgEmail)));
    const meteredEmail = trust === 'claimed' ? sessionEmail : input.orgEmail;

    let result;
    let previewText = null;
    let unlocked = false;

    if (claimedMember) {
      const ipQuota = await checkIpQuota(clientIp(req));
      if (!ipQuota.allowed) {
        return json({ error: 'Daily limit reached from this connection. Try again tomorrow.' }, 429);
      }
      const fullQuota = await checkUnverifiedFullQuota(meteredEmail);
      if (!fullQuota.allowed) {
        return json(
          {
            error: `That's ${unverifiedFullDailyLimit()} full drafts today for this email. Log in to continue without a daily cap, or try again tomorrow.`,
            limitReached: true
          },
          429
        );
      }
    }

    if (verifiedMember || claimedMember) {
      // Paid path — Claude writes the full narrative.
      result = await generateFull(input);
      if (result.error) return json({ error: result.error }, 502);
      unlocked = true;
      if (claimedMember) {
        await bumpUnverifiedFullQuota(meteredEmail);
        await bumpIpQuota(clientIp(req));
      }
    } else {
      // Free path — check the quotas before spending an API call.
      const limit = freePreviewLimit();
      const used = await getEmailUsage(input.orgEmail);
      if (used >= limit) {
        return json(
          {
            error: `You've used all ${limit} free previews for this email. Unlock full drafts to keep going.`,
            limitReached: true
          },
          402
        );
      }

      const ipQuota = await checkIpQuota(clientIp(req));
      if (!ipQuota.allowed) {
        return json({ error: 'Daily free preview limit reached. Try again tomorrow, or unlock full drafts.' }, 429);
      }

      result = await generatePreview(input);
      if (result.error) return json({ error: result.error }, 502);

      previewText = truncateForPreview(result.text);
      await bumpEmailUsage(input.orgEmail);
      await bumpIpQuota(clientIp(req));
    }

    const order = {
      id: crypto.randomUUID(),
      ...input,
      draft: result.text,
      previewDraft: unlocked ? null : result.text,
      previewText: previewText || truncateForPreview(result.text),
      engine: result.engine,
      referencedPoints: getGrantPoints(input.requestType).slice(0, 2),
      unlocked,
      accountEmail: sessionEmail || null,
      createdAt: Date.now()
    };

    await saveOrder(order);
    await indexOrderForEmail(input.orgEmail, order.id);
    if (sessionEmail && sessionEmail !== input.orgEmail) {
      await indexOrderForEmail(sessionEmail, order.id);
    }

    const remaining = unlocked ? null : Math.max(0, freePreviewLimit() - (await getEmailUsage(input.orgEmail)));

    return json({
      id: order.id,
      draft: unlocked ? order.draft : order.previewText,
      preview: !unlocked,
      unlocked,
      engine: unlocked ? 'claude' : 'gemini',
      referencedPoints: order.referencedPoints,
      orgName: order.orgName,
      funderName: order.funderName,
      plan: order.plan,
      freePreviewsRemaining: remaining
    });
  } catch (err) {
    console.error('[generate-draft]', err);
    return json({ error: 'Something went wrong generating the draft. Try again in a moment.' }, 500);
  }
};

export const config = { path: '/api/generate-draft' };
