// One place to change pricing. Amounts are in cents.
// You can also skip these entirely and set STRIPE_PRICE_MONTHLY /
// STRIPE_PRICE_LIFETIME to real Stripe Price IDs — those win if present.

export const PLANS = {
  monthly: {
    id: 'monthly',
    label: 'Monthly',
    name: 'Grantwright Monthly — unlimited full drafts',
    amountCents: Number(process.env.PRICE_MONTHLY_CENTS || 4900),
    mode: 'subscription',
    stripePriceEnv: 'STRIPE_PRICE_MONTHLY'
  },
  lifetime: {
    id: 'lifetime',
    label: 'Lifetime',
    name: 'Grantwright Lifetime — unlimited full drafts, forever',
    amountCents: Number(process.env.PRICE_LIFETIME_CENTS || 39900),
    mode: 'payment',
    stripePriceEnv: 'STRIPE_PRICE_LIFETIME'
  }
};

export function getPlan(id) {
  return PLANS[id] || PLANS.monthly;
}

export function publicPlans() {
  return Object.values(PLANS).map((p) => ({
    id: p.id,
    label: p.label,
    amountCents: p.amountCents,
    mode: p.mode,
    price: formatPrice(p.amountCents),
    suffix: p.mode === 'subscription' ? '/mo' : ' once'
  }));
}

export function formatPrice(cents) {
  const dollars = cents / 100;
  const whole = Number.isInteger(dollars);
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2
  })}`;
}
