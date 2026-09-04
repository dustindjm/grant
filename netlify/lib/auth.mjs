import { getJSON, setJSON, remove, normalizeEmail, isValidEmail } from './store.mjs';

// Passwords: PBKDF2-SHA256 via Web Crypto (built into Node 20, no dependency).
// Sessions: opaque random tokens in Blobs, referenced by an HttpOnly cookie.

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const SESSION_COOKIE = 'gw_session';
const PBKDF2_ITERATIONS = 210000;

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function randomHex(byteLength) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function hashPassword(password, saltHex, iterations = PBKDF2_ITERATIONS) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createAccount(email, password) {
  const key = normalizeEmail(email);
  if (!isValidEmail(key)) return { ok: false, error: 'Enter a valid email address.' };
  if (!password || password.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
  if (password.length > 200) return { ok: false, error: 'Password is too long.' };

  const existing = await getJSON(`account:${key}`);
  if (existing) return { ok: false, error: 'An account with this email already exists. Try logging in.' };

  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  await setJSON(`account:${key}`, {
    email: key,
    salt,
    passwordHash,
    iterations: PBKDF2_ITERATIONS,
    createdAt: Date.now()
  });
  return { ok: true, email: key };
}

export async function verifyLogin(email, password) {
  const key = normalizeEmail(email);
  const generic = { ok: false, error: 'Email or password is incorrect.' };
  if (!key || !password) return generic;

  const account = await getJSON(`account:${key}`);
  if (!account) return generic;

  const hash = await hashPassword(password, account.salt, account.iterations || PBKDF2_ITERATIONS);
  if (!constantTimeEqual(hash, account.passwordHash)) return generic;

  return { ok: true, email: key };
}

export async function changePassword(email, currentPassword, newPassword) {
  const check = await verifyLogin(email, currentPassword);
  if (!check.ok) return { ok: false, error: 'Current password is incorrect.' };
  if (!newPassword || newPassword.length < 8) return { ok: false, error: 'New password must be at least 8 characters.' };

  const key = normalizeEmail(email);
  const salt = randomHex(16);
  await setJSON(`account:${key}`, {
    email: key,
    salt,
    passwordHash: await hashPassword(newPassword, salt),
    iterations: PBKDF2_ITERATIONS,
    createdAt: Date.now()
  });
  return { ok: true };
}

export async function createSession(email) {
  const token = randomHex(32);
  await setJSON(`session:${token}`, {
    email: normalizeEmail(email),
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

export async function getSessionEmail(req) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const session = await getJSON(`session:${token}`);
  if (!session) return null;
  if (session.expiresAt && session.expiresAt < Date.now()) {
    await remove(`session:${token}`);
    return null;
  }
  return session.email || null;
}

export async function destroySession(req) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await remove(`session:${token}`);
}

export function readCookie(req, name) {
  const header = req.headers.get('cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function sessionCookie(token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
