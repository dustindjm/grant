import { getJSON, setJSON, listKeys, normalizeEmail } from './store.mjs';

export async function saveOrder(order) {
  await setJSON(`order:${order.id}`, order);
  return order;
}

export async function getOrder(id) {
  if (!id) return null;
  return getJSON(`order:${id}`);
}

export async function indexOrderForEmail(email, orderId) {
  const key = normalizeEmail(email);
  if (!key || !orderId) return;
  const ids = (await getJSON(`emaildrafts:${key}`)) || [];
  if (!ids.includes(orderId)) {
    ids.push(orderId);
    // Keep the index bounded so a heavy user doesn't grow one blob forever.
    await setJSON(`emaildrafts:${key}`, ids.slice(-200));
  }
}

export async function getOrderIdsForEmail(email) {
  const key = normalizeEmail(email);
  if (!key) return [];
  return (await getJSON(`emaildrafts:${key}`)) || [];
}

export async function listOrders(limit = 300) {
  const keys = await listKeys('order:');
  const orders = await Promise.all(keys.slice(0, limit).map((k) => getJSON(k)));
  return orders.filter(Boolean).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// --- Free preview metering -------------------------------------------------
// Two independent caps: per email address, and per IP per day. Paid members
// bypass both. This is what stops someone farming the free Gemini tier.

const DEFAULT_EMAIL_LIMIT = Number(process.env.FREE_PREVIEW_LIMIT || 3);
const DEFAULT_IP_DAILY_LIMIT = Number(process.env.FREE_PREVIEW_IP_DAILY_LIMIT || 15);

// Full drafts cost real money on the Anthropic side, so the paid path is
// metered too — generously enough that nobody writing grant applications for
// a living will notice, tightly enough that a leaked entitlement cannot run
// up an unbounded bill. Applied only when the membership was claimed by an
// unverified email typed into the form; a session issued at checkout is
// proof of purchase and stays unmetered.
const DEFAULT_UNVERIFIED_FULL_DAILY = Number(process.env.UNVERIFIED_FULL_DAILY_LIMIT || 10);

export function freePreviewLimit() {
  return DEFAULT_EMAIL_LIMIT;
}

export function unverifiedFullDailyLimit() {
  return DEFAULT_UNVERIFIED_FULL_DAILY;
}

export async function checkUnverifiedFullQuota(email) {
  const key = normalizeEmail(email);
  if (!key) return { allowed: false, count: 0 };
  const rec = await getJSON(`usage:full:${today()}:${key}`);
  const count = rec?.count || 0;
  return { allowed: count < DEFAULT_UNVERIFIED_FULL_DAILY, count };
}

export async function bumpUnverifiedFullQuota(email) {
  const key = normalizeEmail(email);
  if (!key) return;
  const k = `usage:full:${today()}:${key}`;
  const rec = await getJSON(k);
  await setJSON(k, { count: (rec?.count || 0) + 1, updatedAt: Date.now() });
}

export async function getEmailUsage(email) {
  const key = normalizeEmail(email);
  if (!key) return 0;
  const rec = await getJSON(`usage:email:${key}`);
  return rec?.count || 0;
}

export async function bumpEmailUsage(email) {
  const key = normalizeEmail(email);
  if (!key) return 0;
  const count = (await getEmailUsage(key)) + 1;
  await setJSON(`usage:email:${key}`, { count, updatedAt: Date.now() });
  return count;
}

export async function checkIpQuota(ip) {
  if (!ip || ip === 'unknown') return { allowed: true };
  const key = `usage:ip:${today()}:${ip}`;
  const rec = await getJSON(key);
  const count = rec?.count || 0;
  if (count >= DEFAULT_IP_DAILY_LIMIT) return { allowed: false, count };
  return { allowed: true, count, key };
}

export async function bumpIpQuota(ip) {
  if (!ip || ip === 'unknown') return;
  const key = `usage:ip:${today()}:${ip}`;
  const rec = await getJSON(key);
  await setJSON(key, { count: (rec?.count || 0) + 1, updatedAt: Date.now() });
}

// What the browser is allowed to see about an order.
export function publicOrder(order, { includeFull = false } = {}) {
  if (!order) return null;
  return {
    id: order.id,
    orgName: order.orgName,
    funderName: order.funderName,
    progName: order.progName || '',
    plan: order.plan,
    unlocked: !!order.unlocked,
    engine: order.engine,
    referencedPoints: order.referencedPoints || [],
    createdAt: order.createdAt,
    draft: includeFull || order.unlocked ? order.draft : order.previewText,
    preview: !(includeFull || order.unlocked),
    previewText: order.previewText
  };
}
