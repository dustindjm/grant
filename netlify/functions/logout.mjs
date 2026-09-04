import { json } from '../lib/http.mjs';
import { destroySession, clearSessionCookie } from '../lib/auth.mjs';

export default async (req) => {
  await destroySession(req);
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
};

export const config = { path: '/api/logout' };
