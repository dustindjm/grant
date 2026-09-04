import { getStore } from '@netlify/blobs';

// Netlify Blobs replaces the Cloudflare KV namespace the old build used.
// Strong consistency matters here: we write an order and then read it back
// moments later when Stripe redirects the customer home.
let cached = null;

// Set GW_MEMORY_STORE=1 to run the test suite without a Netlify environment.
function memoryStore() {
  const mem = (globalThis.__gwMemory ||= new Map());
  return {
    async get(key, opts) {
      if (!mem.has(key)) throw new Error(`not found: ${key}`);
      const raw = mem.get(key);
      return opts?.type === 'json' ? JSON.parse(raw) : raw;
    },
    async setJSON(key, value) {
      mem.set(key, JSON.stringify(value));
    },
    async delete(key) {
      mem.delete(key);
    },
    async list({ prefix } = {}) {
      const keys = [...mem.keys()].filter((k) => !prefix || k.startsWith(prefix));
      return { blobs: keys.map((key) => ({ key })) };
    }
  };
}

export function db() {
  if (!cached) {
    cached =
      process.env.GW_MEMORY_STORE === '1'
        ? memoryStore()
        : getStore({ name: 'grantwright', consistency: 'strong' });
  }
  return cached;
}

export async function getJSON(key) {
  try {
    return await db().get(key, { type: 'json' });
  } catch {
    return null;
  }
}

export async function setJSON(key, value) {
  await db().setJSON(key, value);
  return value;
}

export async function remove(key) {
  try {
    await db().delete(key);
  } catch {
    /* deleting a missing key is not an error for us */
  }
}

export async function listKeys(prefix) {
  try {
    const { blobs } = await db().list({ prefix });
    return blobs.map((b) => b.key);
  } catch {
    return [];
  }
}

export function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

export function isValidEmail(email) {
  const value = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}
