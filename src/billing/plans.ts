// Subscription plans mirror byggexp.se/sv. The actual prices live in Stripe;
// here we only map a (tier, interval) to the env var that holds its Stripe
// Price ID, so plans can be reconfigured without code changes.
// "Anpassad" (40+ users) is a contact/demo tier — no self-serve checkout.
export type PlanTier = "start" | "tillvaxt" | "professionell";
export type BillingInterval = "monthly" | "yearly";

// Public site promises "Första månaden gratis" — a 30-day free trial.
export const TRIAL_DAYS = 30;

export const PRICE_ENV: Record<PlanTier, Record<BillingInterval, string>> = {
  start: {
    monthly: "STRIPE_PRICE_START_MONTHLY",
    yearly: "STRIPE_PRICE_START_YEARLY",
  },
  tillvaxt: {
    monthly: "STRIPE_PRICE_TILLVAXT_MONTHLY",
    yearly: "STRIPE_PRICE_TILLVAXT_YEARLY",
  },
  professionell: {
    monthly: "STRIPE_PRICE_PROFESSIONELL_MONTHLY",
    yearly: "STRIPE_PRICE_PROFESSIONELL_YEARLY",
  },
};

export const PLAN_TIERS: PlanTier[] = ["start", "tillvaxt", "professionell"];

export const isPlanTier = (value: unknown): value is PlanTier =>
  PLAN_TIERS.includes(value as PlanTier);

export const isInterval = (value: unknown): value is BillingInterval =>
  value === "monthly" || value === "yearly";

export const priceIdFor = (
  tier: PlanTier,
  interval: BillingInterval,
): string | null => process.env[PRICE_ENV[tier][interval]] || null;

export const tierForPriceId = (priceId: string): PlanTier | null => {
  const intervals: BillingInterval[] = ["monthly", "yearly"];
  for (const tier of PLAN_TIERS) {
    for (const interval of intervals) {
      if (process.env[PRICE_ENV[tier][interval]] === priceId) return tier;
    }
  }
  return null;
};

export const ACTIVE_STATUSES = new Set(["trialing", "active", "past_due"]);
