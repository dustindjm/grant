import { json, readJson } from '../lib/http.mjs';
import { createAccount, createSession, sessionCookie } from '../lib/auth.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const payload = await readJson(req);
  if (!payload) return json({ error: 'Invalid request body.' }, 400);

  const result = await createAccount(payload.email, payload.password);
  if (!result.ok) return json({ error: result.error }, 400);

  const token = await createSession(result.email);
  return json({ ok: true, email: result.email }, 200, { 'Set-Cookie': sessionCookie(token) });
};

export const config = { path: '/api/signup' };
