import { verifyStripeSignature } from '../lib/stripe.mjs';
import { fulfillCheckout } from '../lib/fulfill.mjs';
import { deactivateMember, activateMember, emailForStripeSubscription, emailForStripeCustomer } from '../lib/members.mjs';

// Stripe moved the subscription reference on invoices in newer API versions;
// check both shapes so renewals keep working after an API upgrade.
function subscriptionIdFrom(invoice) {
  return (
    (typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id) ||
    invoice.parent?.subscription_details?.subscription ||
    null
  );
}

export default async (req) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Acknowledge so Stripe doesn't retry forever while you finish setup.
    return new Response('Webhook not configured.', { status: 200 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  let event;
  try {
    event = await verifyStripeSignature(rawBody, signature, secret);
  } catch (err) {
    console.error('[stripe-webhook] signature check failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        if (session.payment_status === 'paid' || session.status === 'complete') {
          await fulfillCheckout(session);
        }
        break;
      }

      case 'invoice.paid': {
        // Monthly renewal — keep the membership alive.
        const invoice = event.data.object;
        const subId = subscriptionIdFrom(invoice);
        const email =
          (await emailForStripeSubscription(subId)) ||
          (await emailForStripeCustomer(invoice.customer)) ||
          invoice.customer_email;
        if (email) await activateMember(email, 'monthly', { customerId: invoice.customer, subscriptionId: subId });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const email = (await emailForStripeSubscription(sub.id)) || (await emailForStripeCustomer(sub.customer));
        if (email) await deactivateMember(email, 'canceled');
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const email =
          (await emailForStripeSubscription(subscriptionIdFrom(invoice))) ||
          (await emailForStripeCustomer(invoice.customer));
        if (email) await deactivateMember(email, 'past_due');
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error('[stripe-webhook] handler error:', err);
    // Return 200 anyway: a retry storm won't fix a logic bug, and the
    // /api/verify-payment path already unlocks the customer on redirect.
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = { path: '/api/stripe-webhook' };
