// Subscription plans. The actual prices live in Stripe; here we only map a
// (tier, interval) to the env var that holds its Stripe Price ID, so plans can
// be reconfigured without code changes.
export type PlanTier = "basic" | "pro";
export type BillingInterval = "monthly" | "yearly";

export const TRIAL_DAYS = 14;

export const PRICE_ENV: Record<PlanTier, Record<BillingInterval, string>> = {
  basic: {
    monthly: "STRIPE_PRICE_BASIC_MONTHLY",
    yearly: "STRIPE_PRICE_BASIC_YEARLY",
  },
  pro: {
    monthly: "STRIPE_PRICE_PRO_MONTHLY",
    yearly: "STRIPE_PRICE_PRO_YEARLY",
  },
};

export const isPlanTier = (value: unknown): value is PlanTier =>
  value === "basic" || value === "pro";

export const isInterval = (value: unknown): value is BillingInterval =>
  value === "monthly" || value === "yearly";

// Resolve the Stripe Price ID for a plan from the environment.
export const priceIdFor = (
  tier: PlanTier,
  interval: BillingInterval,
): string | null => process.env[PRICE_ENV[tier][interval]] || null;

// Reverse lookup: which tier a Stripe Price ID belongs to (for webhooks).
export const tierForPriceId = (priceId: string): PlanTier | null => {
  const tiers: PlanTier[] = ["basic", "pro"];
  const intervals: BillingInterval[] = ["monthly", "yearly"];
  for (const tier of tiers) {
    for (const interval of intervals) {
      if (process.env[PRICE_ENV[tier][interval]] === priceId) return tier;
    }
  }
  return null;
};

// A subscription in one of these states grants access to the product.
export const ACTIVE_STATUSES = new Set(["trialing", "active", "past_due"]);
