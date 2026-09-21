import { json, readJson } from '../lib/http.mjs';
import { createAccount, createSession, sessionCookie } from '../lib/auth.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const payload = await readJson(req);
  if (!payload) return json({ error: 'Invalid request body.' }, 400);

  const result = await createAccount(payload.email, payload.password);
  if (!result.ok) return json({ error: result.error }, 400);

  // Signing up for an address that already carries a paid entitlement is how
  // someone would take over a customer's membership: nothing in this request
  // proves ownership of the address. The account is still created — refusing
  // would let an attacker permanently block the real customer from
  // registering — but it is flagged for review rather than handed the
  // membership quietly.
  if (result.claimsExistingMembership) {
    console.warn(
      `[signup] new account for ${result.email} claims an existing paid membership. ` +
        'Entitlement is NOT granted from this signup; verify ownership before extending it.'
    );
  }

  const token = await createSession(result.email);
  return json(
    { ok: true, email: result.email, membershipPendingVerification: !!result.claimsExistingMembership },
    200,
    { 'Set-Cookie': sessionCookie(token) }
  );
};

export const config = { path: '/api/signup' };
