import { listOrders, saveOrder } from '../lib/orders.mjs';
import { isMember } from '../lib/members.mjs';
import { sendEmail } from '../lib/email.mjs';
import { escapeHtml } from '../lib/http.mjs';

// Runs hourly. Finds previews that are 24–72 hours old, whose owner never
// paid, and sends one email with a link back to the draft. One email per
// order, ever — a second nudge reads as spam and costs more than it recovers.

const HOUR = 60 * 60 * 1000;
const MIN_AGE = 24 * HOUR;
const MAX_AGE = 72 * HOUR;
const MAX_PER_RUN = 40;

const SITE = (process.env.SITE_URL || process.env.URL || 'https://grant3.netlify.app').replace(/\/$/, '');
const SUPPORT = process.env.SUPPORT_EMAIL || 'dustindjm@outlook.com';

function body(order) {
  const link = `${SITE}/?draft=${encodeURIComponent(order.id)}`;
  const opening = String(order.previewText || order.draft || '').slice(0, 260).trim();

  return `<div style="font-family:Inter,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#091135;max-width:560px">
  <p>Your draft for <strong>${escapeHtml(order.funderName)}</strong> is still saved.</p>

  <p style="color:#36394a">Here's how it opened:</p>
  <blockquote style="margin:0 0 24px;padding:16px 20px;background:#f5f3ff;border-radius:12px;color:#091135">
    ${escapeHtml(opening)}…
  </blockquote>

  <p style="color:#36394a">You saw about the first half. The complete version runs 700–900 words and covers the need, your fit with this funder, the program, your evidence, how the money gets used, and the closing ask — ready to edit and send.</p>

  <p style="margin:28px 0">
    <a href="${link}" style="display:inline-block;background:#127ee3;color:#ffffff;text-decoration:none;font-weight:500;padding:12px 20px;border-radius:8px">Open my draft</a>
  </p>

  <p style="color:#36394a;font-size:14px">If the deadline has passed or you've moved on, ignore this — it's the only reminder we send.</p>
  <p style="color:#36394a;font-size:14px">Questions? Just reply to this email.</p>
</div>`;
}

export default async () => {
  const now = Date.now();
  let scanned = 0;
  let sent = 0;

  try {
    const orders = await listOrders(500);

    for (const order of orders) {
      if (sent >= MAX_PER_RUN) break;
      scanned++;

      const age = now - (order.createdAt || 0);
      if (order.unlocked) continue;
      if (order.followUpSentAt) continue;
      if (age < MIN_AGE || age > MAX_AGE) continue;
      if (!order.orgEmail || !order.previewText) continue;

      // They may have paid on a different draft since. Don't nag customers.
      if (await isMember(order.orgEmail)) continue;

      const result = await sendEmail({
        to: order.orgEmail,
        subject: `Your ${order.funderName} draft is still here`,
        html: body(order)
      });

      // Mark it either way. A retry loop on a failing address helps nobody.
      order.followUpSentAt = now;
      order.followUpResult = result.sent ? 'sent' : result.skipped ? 'skipped' : 'failed';
      await saveOrder(order);
      if (result.sent) sent++;
    }
  } catch (err) {
    console.error('[follow-up] run failed:', err);
  }

  console.log(`[follow-up] scanned ${scanned}, sent ${sent}`);
  return new Response(JSON.stringify({ scanned, sent }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = { schedule: '@hourly' };
