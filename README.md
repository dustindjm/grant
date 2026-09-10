# Grantwright

Grant application draft generator for small nonprofits.
**Free previews are written by Gemini. Paid drafts are written by Claude.**

Rebuilt for Netlify — the previous version targeted Cloudflare Pages Functions
and Cloudflare KV, neither of which exists on Netlify, which is why the API
routes returned nothing when deployed.

---

## How the money works

| | Free visitor | Paying member |
|---|---|---|
| Model | Gemini (free tier) | Claude |
| Length | ~300 words, cut off at ~45% | 700–900 words, complete |
| Shown | Opening only, faded, with an unlock button | Full text, editable |
| Actions | — | Copy, download, edit, rewrite old previews |
| Limit | 3 previews per email, 15/day per IP | Unlimited |

The free preview is a real draft written from the visitor's own intake and the
funder's guidelines, so the value is obvious before they pay — but it stops
before the closing ask, so it isn't submittable on its own.

The moment a payment clears, the server **regenerates that same draft with
Claude** and replaces the preview. The customer sees the upgrade immediately on
return from Stripe.

---

## Deploy

### 1. Push to a Git repo, then connect it to Netlify

Netlify auto-detects `netlify.toml`. Settings it will use:
- Publish directory: `public`
- Functions directory: `netlify/functions`

Drag-and-drop deploys also work, but Git is better here because Netlify then
runs `npm install` and bundles `@netlify/blobs` for you.

### 2. Enable Netlify Blobs

Nothing to click in most accounts — Blobs is enabled by default and the
functions configure themselves. If your account predates Blobs, enable it under
**Site configuration → Blobs**. This replaces the old Cloudflare KV namespace;
there is no binding to set up.

### 3. Set environment variables

Site configuration → Environment variables.

**Required to generate anything:**

| Variable | What it does |
|---|---|
| `GEMINI_API_KEY` | Free previews. Get one at aistudio.google.com — free tier is fine. |
| `ANTHROPIC_API_KEY` | Paid full drafts. console.anthropic.com |

**Required to take money:**

| Variable | What it does |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` (or `sk_test_...` while testing) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from the webhook you create in step 4 |

**Required for the admin dashboard:**

| Variable | What it does |
|---|---|
| `ADMIN_PASSWORD` | Long random string. Protects `/admin.html`. |

**Optional:**

| Variable | Default | What it does |
|---|---|---|
| `PRICE_MONTHLY_CENTS` | `4900` | Monthly price. The UI reads this, so changing it updates the site. |
| `PRICE_SINGLE_CENTS` | `7900` | One-off single draft price. |
| `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_SINGLE` | — | Real Stripe Price IDs. If set, these win over the cents values. |
| `SUPPORT_EMAIL` | `dustindjm@outlook.com` | Reply-to shown in emails. |
| `FREE_PREVIEW_LIMIT` | `3` | Free previews per email address. |
| `FREE_PREVIEW_IP_DAILY_LIMIT` | `15` | Free previews per IP per day. |
| `RESEND_API_KEY` | — | **Sends the abandoned-preview follow-up and the receipt email. This is the highest-ROI variable on the list — without it the recovery email silently does nothing.** resend.com |
| `EMAIL_FROM` | Resend sandbox | e.g. `Grantwright <hello@yourdomain.com>` |
| `ADMIN_EMAIL` | — | You get an email on every new member. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Falls back to `gemini-2.0-flash` automatically. |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | |
| `TEST_UNLOCK_EMAIL` | — | Treat this one email as a paying member, for testing the paid path without a card. |
| `CURRENCY` | `usd` | |

### 4. Create the Stripe webhook

Stripe Dashboard → Developers → Webhooks → Add endpoint:

- URL: `https://YOUR-SITE.netlify.app/api/stripe-webhook`
- Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `customer.subscription.deleted`, `invoice.payment_failed`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy.

The site does not depend on the webhook to unlock a customer — the redirect
back from Stripe calls `/api/verify-payment`, which unlocks immediately. The
webhook is what keeps monthly renewals alive and revokes access on
cancellation, so set it up before going live.

### 5. Before you go live

- Replace `hello@grantwright.co` in `public/index.html`, `privacy.html`, `terms.html`
- Replace `https://grant3.netlify.app/` in `index.html`, `robots.txt`, `sitemap.xml` if you buy a domain
- Swap the placeholder "G" icons if you want different branding
- Switch Stripe from test keys to live keys

---

## Testing it end to end

1. Deploy with test Stripe keys.
2. Generate a draft with any email — you should get a faded preview and "Unlock full drafts".
3. Click unlock, pay with card `4242 4242 4242 4242`, any future expiry, any CVC.
4. You land back on the site and the draft is replaced by the longer Claude version.
5. Generate a second draft with the same email — it comes back complete right away.
6. Open `/admin.html` and sign in with `ADMIN_PASSWORD` to see the order and the member.

To exercise the paid path without paying, set `TEST_UNLOCK_EMAIL` to an address
and use that address as the contact email.

### Local development

```bash
npm install
npx netlify dev        # serves the site and functions together on :8888
npm test               # 56 assertions, no network or API keys needed
```

`npm test` mocks Gemini, Claude, and Stripe, and runs storage in memory. It
covers input validation, the Gemini-preview path, quota enforcement, checkout
parameters, the Claude upgrade on payment, accounts and sessions, draft
isolation between accounts, admin auth, and Stripe webhook signature
verification (including forged and replayed signatures).

---

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/generate-draft` | POST | Gemini preview, or Claude full draft for members |
| `/api/create-checkout-session` | POST | Starts Stripe Checkout |
| `/api/verify-payment` | POST | Confirms payment, unlocks, rewrites with Claude |
| `/api/stripe-webhook` | POST | Renewals, cancellations, failed payments |
| `/api/upgrade-draft` | POST | Member rewrites an old preview in full |
| `/api/signup` `/api/login` `/api/logout` `/api/me` | POST/GET | Accounts and sessions |
| `/api/my-drafts` | POST | Drafts for the logged-in account |
| `/api/billing-portal` | POST | Stripe portal so subscribers self-cancel |
| `/api/admin-orders` | GET | Dashboard data, password-protected |

Routes are declared inside each function with `export const config = { path }`,
so there are no redirect rules to keep in sync.

---

## The follow-up email

`netlify/functions/follow-up.mjs` runs hourly. It finds previews between 24 and
72 hours old whose owner never paid, and sends one email with a link straight
back to the draft. One email per draft, ever. Anyone who has since become a
member is skipped.

This is the highest-return thing in the codebase. People generate a preview,
get pulled into something else, and never return — you already have their
email and their draft, so recovering some of them costs nothing but the send.

It needs `RESEND_API_KEY` set. Without it the function runs, logs, and sends
nothing. Verify a sending domain in Resend before relying on it; the sandbox
sender only delivers to your own address.

The link is `/?draft=<id>`, served by `/api/draft`. The id is a random UUID and
the endpoint only ever returns preview text, never a paid full draft belonging
to someone else.

## SEO

The site ships with six long-form guides under `/guides/`, generated by
`build-guides.mjs` and rebuilt on every Netlify deploy. Each one targets a real
question small nonprofits search for, carries Article and Breadcrumb schema,
and links back to the tool. The home page carries SoftwareApplication and
FAQPage schema, and `sitemap.xml` and `robots.txt` are generated too.

To add a guide, append an object to the `GUIDES` array in `build-guides.mjs`.
The page, the index card, the footer links and the sitemap entry all follow
automatically. Keep them genuinely useful — thin keyword pages get filtered
and do the brand no favours.

After deploying, submit `https://your-site/sitemap.xml` in Google Search
Console. Indexing takes weeks, so treat this as a slow compounding channel
rather than a launch tactic.

**On ads:** don't. A $49/month B2B tool earns more from one conversion than
display ads would earn from thousands of visits, and ads on a payment page
destroy the trust you need at checkout. The guides monetize by converting
readers into drafts, not by impressions.

## What changed from the version you sent

**Made it actually run on Netlify**
- Cloudflare Pages Functions → Netlify Functions v2
- Cloudflare KV → Netlify Blobs
- Added `netlify.toml`; static files moved into `public/`

**The monetization model you asked for**
- Gemini writes free previews; Claude writes paid drafts. The old code called
  Claude for everyone, then hid most of the output — you paid for tokens on
  every free visitor and fell back to a Cloudflare-only model that doesn't
  exist here.
- Payment now triggers a real Claude rewrite instead of just revealing text
  the cheap model already wrote.
- Members can rewrite any earlier preview at no extra cost.

**Bugs fixed**
- `script.js` referenced a `#pkg` select that had been removed from the newer
  HTML, so the whole script threw on load and no button worked.
- The service worker cached `/` forever, so deploys didn't reach returning
  visitors. Now network-first for documents.
- Free-tier metering could be bypassed by changing the email; added a per-IP
  daily cap as well.
- Subscription cancellations never revoked access — no webhook handled them.
- Admin password comparison was not constant-time.
- Session records had no expiry check on read.
- `input` font-size below 16px caused iOS zoom on focus.

**Added for selling**
- Pricing screen with real plans read from the server
- Stripe billing portal so subscribers cancel themselves
- Terms of Service page (Stripe expects one)
- Admin dashboard with member list, MRR estimate, and CSV export
- robots.txt and sitemap.xml

---

## Known limits

- **No email verification on signup.** Someone can register with an address
  they don't own. They still can't see drafts made under another account
  without that account's password.
- **No password reset.** Delete the `account:<email>` blob to let someone
  re-register.
- **Membership is keyed by email address**, so a customer who pays with one
  email and generates with another won't be recognized. The form pre-fills the
  logged-in email to reduce this.
- Preview quota counters are per email and per IP; a determined person with
  many addresses and a VPN can still get extra free previews. The cost ceiling
  is Gemini's free tier, so this is annoying rather than expensive.
