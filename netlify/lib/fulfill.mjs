import { getOrder, saveOrder } from './orders.mjs';
import { activateMember } from './members.mjs';
import { getPlan } from './plans.mjs';
import { generateFull } from './ai.mjs';
import { sendEmail, draftEmailHtml } from './email.mjs';
import { escapeHtml } from './http.mjs';

// Regenerate an order's narrative with Claude. This is the moment the
// customer actually gets what they paid for: the Gemini preview is replaced
// by the longer, better-structured Claude draft.
export async function upgradeDraftWithClaude(order) {
  if (!order) return null;
  if (order.engine && order.engine.startsWith('claude') && order.unlocked) return order;

  const result = await generateFull(order);

  if (result.text) {
    order.draft = result.text;
    order.engine = result.engine;
    order.upgradedAt = Date.now();
    order.upgradeError = null;
  } else {
    // Payment already succeeded, so never lose the order. Keep the preview
    // text as the draft, flag the failure, and let the customer retry.
    order.draft = order.draft || order.previewDraft || order.previewText || '';
    order.upgradeError = result.error || 'Full draft generation failed.';
    console.error('[fulfill] Claude upgrade failed:', order.upgradeError);
  }

  order.unlocked = true;
  await saveOrder(order);
  return order;
}

// Called from both /api/verify-payment and the Stripe webhook. Safe to run
// more than once for the same session.
export async function fulfillCheckout(session) {
  const email = (session.customer_details?.email || session.customer_email || session.metadata?.orgEmail || '')
    .trim()
    .toLowerCase();
  const plan = session.metadata?.plan || (session.mode === 'subscription' ? 'monthly' : 'single');
  const orderId = session.client_reference_id || session.metadata?.orderId || null;

  // A single-draft purchase unlocks that one order only — it must not grant
  // ongoing access the customer did not buy.
  if (email && getPlan(plan).grantsMembership) {
    await activateMember(email, plan, {
      customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
      subscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
    });
  }

  let order = orderId ? await getOrder(orderId) : null;
  if (order) {
    const alreadyDone = order.unlocked && order.engine?.startsWith('claude');
    order.plan = plan;
    order.paidAt = order.paidAt || Date.now();
    order.stripeSessionId = session.id;
    order.unlocked = true;
    await saveOrder(order);

    if (!alreadyDone) {
      order = await upgradeDraftWithClaude(order);
      await notify(order, email, plan);
    }
  }

  return { order, email, plan };
}

async function notify(order, email, plan) {
  // One less variable to forget: sale alerts go to ADMIN_EMAIL, or to the
  // same support address follow-up.mjs already falls back to, so a new sale
  // reaches someone without any extra configuration.
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SUPPORT_EMAIL || 'dustindjm@outlook.com';
  if (adminEmail) {
    const alert = await sendEmail({
      to: adminEmail,
      subject: `New ${plan} member — ${order?.orgName || email}`,
      html: `<p><strong>${escapeHtml(order?.orgName || 'Unknown org')}</strong> (${escapeHtml(email || 'no email')}) joined on the <strong>${escapeHtml(plan)}</strong> plan.</p>`
    });
    if (!alert.sent) {
      console.error(`[fulfill] sale alert for ${order?.id || 'unknown order'} not delivered (${outcome(alert)}).`);
    }
  }

  if (!order) return;

  if (!email) {
    order.receiptEmail = 'no-address';
    console.error(`[fulfill] order ${order.id} was paid but carries no email address — no receipt could be sent.`);
    await saveOrder(order);
    return;
  }
  if (!order.draft) return;

  // Someone just paid. If the receipt does not go out, that has to be visible
  // — in the logs and on the admin dashboard — not swallowed. A missing
  // RESEND_API_KEY is the usual cause and looks identical to success here
  // unless the result is actually inspected.
  const receipt = await sendEmail({
    to: email,
    subject: 'Your Grantwright draft is unlocked',
    html: draftEmailHtml(order)
  });

  order.receiptEmail = outcome(receipt);
  order.receiptEmailAt = Date.now();
  await saveOrder(order);

  if (!receipt.sent) {
    console.error(
      `[fulfill] PAID order ${order.id} (${email}) got no receipt: ${order.receiptEmail}. ` +
        (receipt.skipped ? 'RESEND_API_KEY is not set on this site.' : 'The send failed.')
    );
  }
}

function outcome(result) {
  return result.sent ? 'sent' : result.skipped ? 'skipped' : 'failed';
}
