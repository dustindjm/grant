// Minimal Stripe client on top of fetch(). No `stripe` npm package, which
// keeps the function bundle small and avoids native-dependency surprises.

const STRIPE_API = 'https://api.stripe.com/v1';

function encodeParams(obj, prefix = '', out = []) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === '') continue;
    const path = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === 'object') {
          encodeParams(item, `${path}[${i}]`, out);
        } else {
          out.push(`${encodeURIComponent(`${path}[${i}]`)}=${encodeURIComponent(item)}`);
        }
      });
    } else if (typeof value === 'object') {
      encodeParams(value, path, out);
    } else {
      out.push(`${encodeURIComponent(path)}=${encodeURIComponent(value)}`);
    }
  }
  return out;
}

export function formEncode(obj) {
  return encodeParams(obj).join('&');
}

export async function stripeRequest(method, path, params) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not set on the server.');

  const init = {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  };
  if (params && method !== 'GET') init.body = formEncode(params);

  const res = await fetch(`${STRIPE_API}${path}`, init);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data?.error?.message || `Stripe request failed (${res.status}).`);
    err.status = res.status;
    err.stripeCode = data?.error?.code;
    throw err;
  }
  return data;
}

export function createCheckoutSession(params) {
  return stripeRequest('POST', '/checkout/sessions', params);
}

export function retrieveCheckoutSession(id) {
  return stripeRequest('GET', `/checkout/sessions/${encodeURIComponent(id)}`);
}

export function createBillingPortalSession(params) {
  return stripeRequest('POST', '/billing_portal/sessions', params);
}

// --- Webhook signature verification (Web Crypto, no Node-only APIs) --------

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyStripeSignature(rawBody, signatureHeader, webhookSecret, toleranceSeconds = 300) {
  if (!signatureHeader) throw new Error('Missing stripe-signature header.');

  const parts = {};
  for (const chunk of signatureHeader.split(',')) {
    const idx = chunk.indexOf('=');
    if (idx === -1) continue;
    const k = chunk.slice(0, idx).trim();
    const v = chunk.slice(idx + 1).trim();
    if (k === 'v1') (parts.v1 ||= []).push(v);
    else parts[k] = v;
  }

  const timestamp = parts.t;
  const signatures = parts.v1 || [];
  if (!timestamp || !signatures.length) throw new Error('Malformed stripe-signature header.');

  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(age) || Math.abs(age) > toleranceSeconds) {
    throw new Error('Webhook timestamp is outside the tolerance window.');
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const expected = toHex(mac);

  if (!signatures.some((sig) => timingSafeEqual(expected, sig))) {
    throw new Error('Webhook signature mismatch.');
  }
  return JSON.parse(rawBody);
}
