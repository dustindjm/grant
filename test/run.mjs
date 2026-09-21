// Offline end-to-end test. Mocks fetch() for Gemini, Claude and Stripe, and
// runs the storage layer in memory. Run with: npm test
process.env.GW_MEMORY_STORE = '1';
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.ANTHROPIC_API_KEY = 'test-claude';
process.env.STRIPE_SECRET_KEY = 'sk_test_123';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
process.env.ADMIN_PASSWORD = 'hunter2hunter2';
process.env.SITE_URL = 'https://grant3.netlify.app';
process.env.RESEND_API_KEY = 'test-resend';

const GEMINI_TEXT = Array.from({ length: 14 }, (_, i) => `Gemini preview sentence number ${i + 1} about the clinic and the funder.`).join(' ');
const CLAUDE_TEXT = Array.from({ length: 40 }, (_, i) => `Claude full narrative sentence ${i + 1} covering need, fit, program and evidence.`).join(' ');

const calls = [];
const realFetch = globalThis.fetch;

globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  calls.push({ href, method: init.method || 'GET' });

  if (href.includes('generativelanguage.googleapis.com')) {
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: GEMINI_TEXT }] } }] }), { status: 200 });
  }
  if (href.includes('api.anthropic.com')) {
    return new Response(JSON.stringify({ content: [{ type: 'text', text: CLAUDE_TEXT }] }), { status: 200 });
  }
  if (href.includes('api.stripe.com/v1/checkout/sessions')) {
    if (init.method === 'POST') {
      globalThis.__lastStripeBody = init.body;
      return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/pay/cs_test_1' }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        id: 'cs_test_1',
        payment_status: 'paid',
        status: 'complete',
        mode: 'subscription',
        customer: 'cus_1',
        subscription: 'sub_1',
        customer_details: { email: 'clinic@example.org' },
        client_reference_id: globalThis.__orderId,
        metadata: { orderId: globalThis.__orderId, plan: 'monthly', orgEmail: 'clinic@example.org' }
      }),
      { status: 200 }
    );
  }
  if (href.includes('api.resend.com')) return new Response('{}', { status: 200 });
  return realFetch(url, init);
};

// ---------------------------------------------------------------- test utils
let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}
function post(path, body, headers = {}) {
  return new Request(`https://grant3.netlify.app${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

const generate = (await import('../netlify/functions/generate-draft.mjs')).default;
const checkout = (await import('../netlify/functions/create-checkout-session.mjs')).default;
const verify = (await import('../netlify/functions/verify-payment.mjs')).default;
const signup = (await import('../netlify/functions/signup.mjs')).default;
const login = (await import('../netlify/functions/login.mjs')).default;
const me = (await import('../netlify/functions/me.mjs')).default;
const myDrafts = (await import('../netlify/functions/my-drafts.mjs')).default;
const adminOrders = (await import('../netlify/functions/admin-orders.mjs')).default;
const upgrade = (await import('../netlify/functions/upgrade-draft.mjs')).default;
const { truncateForPreview } = await import('../netlify/lib/ai.mjs');
const { verifyStripeSignature, formEncode } = await import('../netlify/lib/stripe.mjs');

const intake = {
  orgName: 'Riverside Family Clinic',
  orgEmail: 'clinic@example.org',
  funderName: 'Community Health Access Fund',
  rfpText: 'The Fund supports general operating support for clinics serving uninsured adults. Priorities include access, equity, and sustainability of care in rural counties.',
  orgMission: 'We run a sliding-scale clinic for uninsured adults.',
  requestType: 'General operating support',
  progName: 'Evening Walk-In Access',
  amount: '$45,000',
  outcomes: 'Visits grew over two years.',
  plan: 'monthly'
};

console.log('\n1. Validation');
{
  const r = await generate(post('/api/generate-draft', { orgName: 'X' }));
  check('rejects missing fields', r.status === 400);

  const r2 = await generate(post('/api/generate-draft', { ...intake, orgEmail: 'nope' }));
  check('rejects bad email', r2.status === 400);

  const r3 = await generate(post('/api/generate-draft', { ...intake, rfpText: 'too short' }));
  check('rejects thin RFP text', r3.status === 400);

  const r4 = await generate(new Request('https://x/api/generate-draft', { method: 'GET' }));
  check('rejects wrong method', r4.status === 405);
}

console.log('\n2. Free preview uses Gemini and is truncated');
let orderId;
{
  const res = await generate(post('/api/generate-draft', intake));
  const body = await res.json();
  orderId = body.id;
  globalThis.__orderId = orderId;

  check('returns 200', res.status === 200, JSON.stringify(body).slice(0, 200));
  check('flagged as preview', body.preview === true);
  check('not unlocked', body.unlocked === false);
  check('engine is gemini', body.engine === 'gemini');
  check('called Gemini', calls.some((c) => c.href.includes('generativelanguage')));
  check('did NOT call Claude', !calls.some((c) => c.href.includes('anthropic')));
  check('draft shorter than full Gemini text', body.draft.length < GEMINI_TEXT.length);
  check('draft is substantive', body.draft.length > 200);
  check('reports remaining quota', body.freePreviewsRemaining === 2, String(body.freePreviewsRemaining));
  check('includes referenced points', Array.isArray(body.referencedPoints) && body.referencedPoints.length > 0);
}

console.log('\n3. Free quota is enforced');
{
  await generate(post('/api/generate-draft', intake));
  await generate(post('/api/generate-draft', intake));
  const res = await generate(post('/api/generate-draft', intake));
  const body = await res.json();
  check('4th preview blocked with 402', res.status === 402, String(res.status));
  check('limitReached flag set', body.limitReached === true);
}

console.log('\n4. Checkout session');
{
  const res = await checkout(post('/api/create-checkout-session', { plan: 'monthly', orderId, email: 'clinic@example.org' }));
  const body = await res.json();
  check('returns a Stripe URL', typeof body.url === 'string' && body.url.includes('checkout.stripe.com'));
  const sent = decodeURIComponent(globalThis.__lastStripeBody || '');
  check('subscription mode', sent.includes('mode=subscription'));
  check('recurring interval set', sent.includes('recurring][interval]=month'));
  check('order id attached', sent.includes(`client_reference_id=${orderId}`));
  check('success url points home', sent.includes('paid=true'));

  const one = await checkout(post('/api/create-checkout-session', { plan: 'single', orderId }));
  await one.json();
  check('single draft uses one-time payment mode', decodeURIComponent(globalThis.__lastStripeBody).includes('mode=payment'));
}

console.log('\n5. Payment unlocks and rewrites with Claude');
{
  const res = await verify(post('/api/verify-payment', { session_id: 'cs_test_1' }));
  const body = await res.json();
  check('marked paid', body.paid === true);
  check('order returned unlocked', body.order?.unlocked === true);
  check('draft replaced by Claude text', body.order?.draft === CLAUDE_TEXT);
  check('engine records claude', String(body.order?.engine).startsWith('claude'));
  check('Claude was called', calls.some((c) => c.href.includes('anthropic')));
}

console.log('\n6. Member now gets Claude directly, with no quota');
{
  const res = await generate(post('/api/generate-draft', { ...intake, funderName: 'Second Funder' }));
  const body = await res.json();
  check('unlocked immediately', body.unlocked === true, String(res.status));
  check('engine is claude', body.engine === 'claude');
  check('full length draft', body.draft === CLAUDE_TEXT);
  check('no preview flag', body.preview === false);
}

console.log('\n7. Accounts and sessions');
let cookie;
{
  const weak = await signup(post('/api/signup', { email: 'clinic@example.org', password: 'short' }));
  check('rejects short password', weak.status === 400);

  const res = await signup(post('/api/signup', { email: 'clinic@example.org', password: 'correct-horse-battery' }));
  check('signup succeeds', res.status === 200);
  cookie = res.headers.get('set-cookie');
  check('sets HttpOnly Secure cookie', /HttpOnly/.test(cookie) && /Secure/.test(cookie) && /SameSite=Lax/.test(cookie));

  const dup = await signup(post('/api/signup', { email: 'clinic@example.org', password: 'correct-horse-battery' }));
  check('blocks duplicate signup', dup.status === 400);

  const bad = await login(post('/api/login', { email: 'clinic@example.org', password: 'wrong-password-x' }));
  check('rejects wrong password', bad.status === 401);

  const good = await login(post('/api/login', { email: 'CLINIC@example.org', password: 'correct-horse-battery' }));
  check('login is case-insensitive on email', good.status === 200);
  cookie = good.headers.get('set-cookie').split(';')[0];
}

console.log('\n8. Session-scoped data');
{
  const anon = await myDrafts(new Request('https://x/api/my-drafts', { method: 'POST' }));
  check('drafts require login', anon.status === 401);

  const authed = await myDrafts(new Request('https://x/api/my-drafts', { method: 'POST', headers: { cookie } }));
  const body = await authed.json();
  check('returns the drafts for that account', body.drafts.length >= 4, String(body.drafts?.length));
  check('drafts are newest first', body.drafts[0].createdAt >= body.drafts[1].createdAt);
  check('no rfpText leaked to client', !JSON.stringify(body).includes('Priorities include access'));

  const session = await (await me(new Request('https://x/api/me', { headers: { cookie } }))).json();
  check('me reports logged in', session.loggedIn === true);
  check('me reports membership', session.member === true);
  check('me exposes both plans', session.plans.length === 2, String(session.plans.length));
  check('single-draft plan is not a membership plan', session.plans.find((p) => p.id === 'single').grantsMembership === false);
}

console.log('\n9. Admin dashboard');
{
  const denied = await adminOrders(new Request('https://x/api/admin-orders', { headers: { 'x-admin-password': 'wrong' } }));
  check('rejects bad admin password', denied.status === 401);

  const ok = await adminOrders(new Request('https://x/api/admin-orders', { headers: { 'x-admin-password': 'hunter2hunter2' } }));
  const body = await ok.json();
  check('returns orders', body.orders.length >= 4);
  check('counts active members', body.stats.activeMembers === 1, JSON.stringify(body.stats));
  check('computes MRR', body.stats.mrr === '$49');
}

console.log('\n10. Upgrade endpoint guards');
{
  const missing = await upgrade(post('/api/upgrade-draft', { orderId: 'nope' }));
  check('404 for unknown draft', missing.status === 404);
  const ok = await upgrade(post('/api/upgrade-draft', { orderId }, { cookie }));
  check('member can rewrite own draft', ok.status === 200, String(ok.status));
}

console.log('\n10b. A single-draft purchase unlocks one draft, not membership');
{
  const { fulfillCheckout } = await import('../netlify/lib/fulfill.mjs');
  const { isMember } = await import('../netlify/lib/members.mjs');
  const one = await generate(post('/api/generate-draft', { ...intake, orgEmail: 'oneoff@example.org', funderName: 'One Off Fund' }));
  const oneBody = await one.json();
  check('preview issued to new email', oneBody.preview === true, String(one.status));

  await fulfillCheckout({
    id: 'cs_single_1',
    payment_status: 'paid',
    mode: 'payment',
    customer_details: { email: 'oneoff@example.org' },
    client_reference_id: oneBody.id,
    metadata: { orderId: oneBody.id, plan: 'single', orgEmail: 'oneoff@example.org' }
  });

  const stillNotMember = !(await isMember('oneoff@example.org'));
  check('buyer did NOT become a member', stillNotMember);

  const after = await generate(post('/api/generate-draft', { ...intake, orgEmail: 'oneoff@example.org', funderName: 'Another Fund' }));
  const afterBody = await after.json();
  check('their next draft is still a preview', afterBody.preview === true, String(after.status));

  const rewrite = await upgrade(post('/api/upgrade-draft', { orderId: oneBody.id }));
  check('but they can rewrite the draft they paid for', rewrite.status === 200, String(rewrite.status));
}

console.log('\n10c. Abandoned-preview follow-up');
{
  const followUp = (await import('../netlify/functions/follow-up.mjs')).default;
  const { getOrder, saveOrder } = await import('../netlify/lib/orders.mjs');
  const getDraft = (await import('../netlify/functions/get-draft.mjs')).default;

  const fresh = await (await generate(post('/api/generate-draft', { ...intake, orgEmail: 'lapsed@example.org', funderName: 'Lapsed Fund' }))).json();

  let run = await (await followUp()).json();
  check('does not email a draft made minutes ago', run.sent === 0, JSON.stringify(run));

  // Age it into the window.
  const aged = await getOrder(fresh.id);
  aged.createdAt = Date.now() - 30 * 60 * 60 * 1000;
  await saveOrder(aged);

  run = await (await followUp()).json();
  check('emails a 30-hour-old unpaid preview', run.sent === 1, JSON.stringify(run));

  run = await (await followUp()).json();
  check('never emails the same draft twice', run.sent === 0, JSON.stringify(run));

  const resume = await getDraft(new Request(`https://x/api/draft?id=${fresh.id}`));
  const resumeBody = await resume.json();
  check('email link resolves the draft', resumeBody.order?.id === fresh.id);
  check('resume link returns preview text only', resumeBody.order.preview === true);

  const gone = await getDraft(new Request('https://x/api/draft?id=does-not-exist'));
  check('unknown draft id is a 404', gone.status === 404);

  // With no RESEND_API_KEY the send is skipped, not attempted. Skipping must
  // not consume the order's one-and-only nudge, or the draft stays burned
  // even after the key is configured.
  const orphan = await (await generate(post('/api/generate-draft', { ...intake, orgEmail: 'nokey@example.org', funderName: 'No Key Fund' }))).json();
  const agedOrphan = await getOrder(orphan.id);
  agedOrphan.createdAt = Date.now() - 30 * 60 * 60 * 1000;
  await saveOrder(agedOrphan);

  const savedKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  run = await (await followUp()).json();
  check('reports the skip instead of sending', run.sent === 0 && run.skipped === 1, JSON.stringify(run));
  check('does not mark a skipped order as followed up', !(await getOrder(orphan.id)).followUpSentAt);

  process.env.RESEND_API_KEY = savedKey;
  run = await (await followUp()).json();
  check('once the key is set, the nudge still goes out', run.sent === 1, JSON.stringify(run));
}

console.log('\n10d. A paid order records whether its receipt was delivered');
{
  const { getOrder } = await import('../netlify/lib/orders.mjs');
  const { fulfillCheckout } = await import('../netlify/lib/fulfill.mjs');

  const made = await (await generate(post('/api/generate-draft', { ...intake, orgEmail: 'receipt@example.org', funderName: 'Receipt Fund' }))).json();
  await fulfillCheckout({
    id: 'cs_receipt_1',
    payment_status: 'paid',
    mode: 'payment',
    client_reference_id: made.id,
    customer_details: { email: 'receipt@example.org' },
    metadata: { orderId: made.id, plan: 'single', orgEmail: 'receipt@example.org' }
  });
  check('receipt delivery is recorded on the order', (await getOrder(made.id)).receiptEmail === 'sent');

  // Same purchase with email switched off: the order must carry the failure
  // rather than look identical to a delivered one.
  const dark = await (await generate(post('/api/generate-draft', { ...intake, orgEmail: 'dark@example.org', funderName: 'Dark Fund' }))).json();
  const savedKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  await fulfillCheckout({
    id: 'cs_receipt_2',
    payment_status: 'paid',
    mode: 'payment',
    client_reference_id: dark.id,
    customer_details: { email: 'dark@example.org' },
    metadata: { orderId: dark.id, plan: 'single', orgEmail: 'dark@example.org' }
  });
  process.env.RESEND_API_KEY = savedKey;

  const darkOrder = await getOrder(dark.id);
  check('an undelivered receipt is flagged, not silent', darkOrder.receiptEmail === 'skipped');
  check('the customer still got what they paid for', darkOrder.unlocked === true && darkOrder.engine.startsWith('claude'));

  const dash = await adminOrders(new Request('https://x/api/admin-orders', { headers: { 'x-admin-password': 'hunter2hunter2' } }));
  const stats = (await dash.json()).stats;
  check('admin dashboard counts undelivered receipts', stats.receiptsUndelivered >= 1, JSON.stringify(stats.receiptsUndelivered));
  check('admin dashboard reports email is configured', stats.emailConfigured === true);
}

console.log('\n10e. Entitlement cannot be claimed by typing an email');
{
  const { activateMember, membershipTrust } = await import('../netlify/lib/members.mjs');
  const { createSession } = await import('../netlify/lib/auth.mjs');
  const signupFn = (await import('../netlify/functions/signup.mjs')).default;
  const { unverifiedFullDailyLimit } = await import('../netlify/lib/orders.mjs');

  const paid = 'director@realnonprofit.org';
  await activateMember(paid, 'monthly', { customerId: 'cus_rnp', subscriptionId: 'sub_rnp' });

  const gen = (body, cookie, ip) => generate(new Request('https://x/api/generate-draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-nf-client-connection-ip': ip, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body)
  }));
  const shot = async (email, cookie, ip) => {
    const r = await gen({ ...intake, orgEmail: email, funderName: 'Claim Fund' }, cookie, ip);
    return { status: r.status, body: await r.json() };
  };

  // A session minted against a completed checkout is proof of purchase.
  const paidCookie = `gw_session=${await createSession(paid)}`;
  check('a checkout session is verified', (await membershipTrust(paid)) === 'verified');

  let unmetered = 0;
  for (let i = 0; i < unverifiedFullDailyLimit() + 3; i++) {
    const r = await shot(paid, paidCookie, '2.2.2.2');
    if (r.body.unlocked) unmetered++;
  }
  check('a paying customer is never capped', unmetered === unverifiedFullDailyLimit() + 3, String(unmetered));

  // Anonymous, just typing the customer's address into the form.
  let free = 0;
  let refused = 0;
  let lastStatus = 0;
  for (let i = 0; i < unverifiedFullDailyLimit() + 3; i++) {
    const r = await shot(paid, null, '1.1.1.1');
    lastStatus = r.status;
    if (r.body.unlocked) free++; else refused++;
  }
  check('a typed-in address is capped, not unlimited', free === unverifiedFullDailyLimit(), String(free));
  check('over the cap returns 429', refused === 3 && lastStatus === 429, `${refused}/${lastStatus}`);

  // Registering an account for an address that already paid must not hand
  // over the membership — nothing proved ownership of that address.
  const takeover = await signupFn(new Request('https://x/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: paid, password: 'attacker-password' })
  }));
  const takeoverBody = await takeover.clone().json();
  check('signup onto a paid address is flagged', takeoverBody.membershipPendingVerification === true);
  check('and that session is not verified', (await membershipTrust(paid)) === 'claimed');

  // An ordinary visitor is untouched by any of this.
  const visitor = await shot('nobody@example.org', null, '4.4.4.4');
  check('an ordinary visitor still gets a preview', visitor.body.preview === true && visitor.body.unlocked === false);
}

console.log('\n10f. No paying customer is ever locked out');
{
  const { activateMember, deactivateMember, membershipTrust } = await import('../netlify/lib/members.mjs');
  const { createAccount, createSession } = await import('../netlify/lib/auth.mjs');
  const meFn = (await import('../netlify/functions/me.mjs')).default;
  const { unverifiedFullDailyLimit } = await import('../netlify/lib/orders.mjs');

  const shot = async (email, cookie, ip) => {
    const r = await generate(new Request('https://x/api/generate-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-nf-client-connection-ip': ip, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ ...intake, orgEmail: email, funderName: `Fund ${Math.random()}` })
    }));
    return { status: r.status, body: await r.json() };
  };

  // Registered first, then paid: the ordinary funnel, and it must stay unmetered.
  await createAccount('early@org.org', 'password123');
  await new Promise((r) => setTimeout(r, 5));
  await activateMember('early@org.org', 'monthly', { customerId: 'c_early', subscriptionId: 's_early' });
  check('signing up before paying stays verified', (await membershipTrust('early@org.org')) === 'verified');

  // Paid, but the browser never made it back from Stripe, so no session was
  // ever minted. Typing the address must still work, just capped.
  await activateMember('webhook@org.org', 'monthly', { customerId: 'c_wh', subscriptionId: 's_wh' });
  let got = 0;
  for (let i = 0; i < unverifiedFullDailyLimit() + 3; i++) {
    const r = await shot('webhook@org.org', null, '8.8.8.8');
    if (r.body.unlocked) got++;
  }
  check('a webhook-only customer still gets full drafts', got === unverifiedFullDailyLimit(), String(got));

  // Returning after the session lapsed: downgraded to metered, never refused.
  await activateMember('lapsed@org.org', 'monthly', { customerId: 'c_lap', subscriptionId: 's_lap' });
  await new Promise((r) => setTimeout(r, 5));
  await createAccount('lapsed@org.org', 'password123');
  const lapsedCookie = `gw_session=${await createSession('lapsed@org.org')}`;
  check('a lapsed customer is claimed, not refused', (await membershipTrust('lapsed@org.org')) === 'claimed');
  const lapsed = await shot('lapsed@org.org', lapsedCookie, '9.9.9.9');
  check('and still receives a full draft', lapsed.body.unlocked === true && lapsed.body.engine === 'claude');

  const meBody = await (await meFn(new Request('https://x/api/me', { headers: { cookie: lapsedCookie } }))).json();
  check('the UI is told it is capped', meBody.member === true && meBody.verified === false);
  check('and by how much', meBody.fullDraftsRemaining === unverifiedFullDailyLimit() - 1, String(meBody.fullDraftsRemaining));

  // Cancelling still revokes.
  const earlyCookie = `gw_session=${await createSession('early@org.org')}`;
  await deactivateMember('early@org.org', 'canceled');
  check('a cancelled subscriber loses membership', (await membershipTrust('early@org.org')) === null);
  const cancelled = await shot('early@org.org', earlyCookie, '6.6.6.6');
  check('and drops back to previews', cancelled.body.preview === true && cancelled.body.unlocked === false);
}

console.log('\n11. Stripe webhook signature');
{
  const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_x' } } });
  const ts = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec_test'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${body}`));
  const sig = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');

  const good = await verifyStripeSignature(body, `t=${ts},v1=${sig}`, 'whsec_test');
  check('accepts a valid signature', good.type === 'checkout.session.completed');

  let rejected = false;
  try { await verifyStripeSignature(body, `t=${ts},v1=deadbeef`, 'whsec_test'); } catch { rejected = true; }
  check('rejects a forged signature', rejected);

  let stale = false;
  try { await verifyStripeSignature(body, `t=${ts - 9999},v1=${sig}`, 'whsec_test'); } catch { stale = true; }
  check('rejects a replayed old event', stale);
}

console.log('\n12. Utilities');
{
  const text = 'One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten. Eleven. Twelve.';
  const cut = truncateForPreview(text);
  check('preview keeps a prefix', text.startsWith(cut.slice(0, 20)));
  check('short text is returned whole', truncateForPreview('Hi there.') === 'Hi there.');
  check('form encoding nests brackets', formEncode({ a: { b: 'c' } }) === 'a%5Bb%5D=c');
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
