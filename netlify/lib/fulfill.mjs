import { getOrder, saveOrder } from './orders.mjs';
import { activateMember } from './members.mjs';
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
  const plan = session.metadata?.plan || (session.mode === 'subscription' ? 'monthly' : 'lifetime');
  const orderId = session.client_reference_id || session.metadata?.orderId || null;

  if (email) {
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
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    await sendEmail({
      to: adminEmail,
      subject: `New ${plan} member — ${order?.orgName || email}`,
      html: `<p><strong>${escapeHtml(order?.orgName || 'Unknown org')}</strong> (${escapeHtml(email || 'no email')}) joined on the <strong>${escapeHtml(plan)}</strong> plan.</p>`
    });
  }
  if (email && order?.draft) {
    await sendEmail({
      to: email,
      subject: 'Your Grantwright draft is unlocked',
      html: draftEmailHtml(order)
    });
  }
}
