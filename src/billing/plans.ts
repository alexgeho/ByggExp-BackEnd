// Subscription plans mirror byggexp.se/sv. The actual prices live in Stripe;
// here we only map a (tier, interval) to the env var that holds its Stripe
// Price ID, so plans can be reconfigured without code changes.
//
// Self-serve tiers (from 2026-09-25), split by what the company needs:
//   faktura  — the economy package (offers, invoices, payroll, project
//              economy, receipts), flat price, max 2 users.
//   projekt  — projects, crews, hours, tasks, photos, tools. Per-seat price:
//              base fee incl. 10 users + a fee per extra user.
//   komplett — projekt + economy (offers, invoices, expenses, payroll,
//              profitability). Per-seat like projekt.
// Per-seat tiers use a Stripe *graduated tiered* price (tier 1: up to
// INCLUDED_SEATS units, flat base fee, 0/unit; tier 2: per-unit fee), so the
// subscription quantity is simply the company's number of billable users
// (see BillingService.countBillableSeats).
export type PlanTier = "faktura" | "projekt" | "komplett";
export type BillingInterval = "monthly" | "yearly";

// Plans sold before 2026-09-25. Not offered in checkout any more, but companies
// that already have one (e.g. assigned by a superadmin) keep working.
export type LegacyPlanTier = "start" | "tillvaxt" | "professionell";
export const LEGACY_PLAN_TIERS: LegacyPlanTier[] = [
  "start",
  "tillvaxt",
  "professionell",
];

// Public site promises "Första månaden gratis" — a 30-day free trial.
export const TRIAL_DAYS = 30;

export const PRICE_ENV: Record<PlanTier, Record<BillingInterval, string>> = {
  faktura: {
    monthly: "STRIPE_PRICE_FAKTURA_MONTHLY",
    yearly: "STRIPE_PRICE_FAKTURA_YEARLY",
  },
  projekt: {
    monthly: "STRIPE_PRICE_PROJEKT_MONTHLY",
    yearly: "STRIPE_PRICE_PROJEKT_YEARLY",
  },
  komplett: {
    monthly: "STRIPE_PRICE_KOMPLETT_MONTHLY",
    yearly: "STRIPE_PRICE_KOMPLETT_YEARLY",
  },
};

export const PLAN_TIERS: PlanTier[] = ["faktura", "projekt", "komplett"];

// Users included in the base fee of a per-seat tier.
export const INCLUDED_SEATS = 10;

// A worker (app-only user) counts as a billable seat only if they clocked in
// within this many days; office roles always count.
export const ACTIVE_WORKER_WINDOW_DAYS = 30;

// Optional add-ons, billed as an extra subscription line item.
export type Addon = "integrations";
export const ADDONS: Addon[] = ["integrations"];
export const ADDON_PRICE_ENV: Record<Addon, Record<BillingInterval, string>> = {
  integrations: {
    monthly: "STRIPE_PRICE_INTEGRATIONS_MONTHLY",
    yearly: "STRIPE_PRICE_INTEGRATIONS_YEARLY",
  },
};
export const isAddon = (value: unknown): value is Addon =>
  ADDONS.includes(value as Addon);
export const addonPriceIdFor = (
  addon: Addon,
  interval: BillingInterval,
): string | null => process.env[ADDON_PRICE_ENV[addon][interval]] || null;

// Tiers billed per active user (subscription quantity = seat count).
export const PER_SEAT_TIERS: PlanTier[] = ["projekt", "komplett"];

export const isPlanTier = (value: unknown): value is PlanTier =>
  PLAN_TIERS.includes(value as PlanTier);

// Any plan a company may carry: current self-serve tiers or a legacy one.
export const isKnownPlan = (
  value: unknown,
): value is PlanTier | LegacyPlanTier =>
  isPlanTier(value) || LEGACY_PLAN_TIERS.includes(value as LegacyPlanTier);

export const isPerSeat = (tier: string | null | undefined): boolean =>
  PER_SEAT_TIERS.includes(tier as PlanTier);

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

// Seat limit (max users) each plan includes by default; null = unlimited.
// Per-seat tiers are uncapped (every extra user is billed). A superadmin can
// override the number per company. These are the defaults applied when a plan
// is assigned or a subscription starts.
export const PLAN_MAX_USERS: Record<PlanTier | LegacyPlanTier, number | null> =
  {
    faktura: 2,
    projekt: null,
    komplett: null,
    start: 10,
    tillvaxt: 25,
    professionell: 40,
  };

export const maxUsersForPlan = (plan?: string | null): number | null =>
  plan && isKnownPlan(plan) ? PLAN_MAX_USERS[plan] : null;

// Stripe quantity for a subscription: seats for per-seat tiers, else 1.
export const quantityFor = (tier: string | null | undefined, seats: number) =>
  isPerSeat(tier) ? Math.max(1, Math.floor(seats)) : 1;
