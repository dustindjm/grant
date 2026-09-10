// One place to change pricing. Amounts are in cents.
// You can also skip these entirely and set STRIPE_PRICE_MONTHLY /
// STRIPE_PRICE_LIFETIME to real Stripe Price IDs — those win if present.

export const PLANS = {
  single: {
    id: 'single',
    label: 'Single draft',
    name: 'Grantwright — one complete grant application draft',
    amountCents: Number(process.env.PRICE_SINGLE_CENTS || 7900),
    mode: 'payment',
    grantsMembership: false,
    stripePriceEnv: 'STRIPE_PRICE_SINGLE'
  },
  monthly: {
    id: 'monthly',
    label: 'Monthly',
    name: 'Grantwright Monthly — unlimited full drafts',
    amountCents: Number(process.env.PRICE_MONTHLY_CENTS || 4900),
    mode: 'subscription',
    grantsMembership: true,
    stripePriceEnv: 'STRIPE_PRICE_MONTHLY'
  }
};

export function getPlan(id) {
  return PLANS[id] || PLANS.single;
}

export function publicPlans() {
  return Object.values(PLANS).map((p) => ({
    id: p.id,
    label: p.label,
    amountCents: p.amountCents,
    mode: p.mode,
    grantsMembership: p.grantsMembership,
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
