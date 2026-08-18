import {
  PLAN_MAX_USERS,
  PLAN_TIERS,
  TRIAL_DAYS,
  isInterval,
  isPlanTier,
  maxUsersForPlan,
} from "./plans";

describe("plans — tiers & seat limits", () => {
  it("recognises the three real tiers and rejects anything else", () => {
    expect(isPlanTier("start")).toBe(true);
    expect(isPlanTier("tillvaxt")).toBe(true);
    expect(isPlanTier("professionell")).toBe(true);
    expect(isPlanTier("basic")).toBe(false); // legacy name, no longer valid
    expect(isPlanTier("anpassad")).toBe(false); // contact-only, not a self-serve tier
    expect(isPlanTier(null)).toBe(false);
    expect(isPlanTier(undefined)).toBe(false);
    expect(isPlanTier(42)).toBe(false);
  });

  it("validates billing intervals", () => {
    expect(isInterval("monthly")).toBe(true);
    expect(isInterval("yearly")).toBe(true);
    expect(isInterval("weekly")).toBe(false);
  });

  it("has a seat limit for every tier, increasing with the tier", () => {
    for (const tier of PLAN_TIERS) {
      expect(typeof PLAN_MAX_USERS[tier]).toBe("number");
      expect(PLAN_MAX_USERS[tier]).toBeGreaterThan(0);
    }
    expect(PLAN_MAX_USERS.start).toBeLessThan(PLAN_MAX_USERS.tillvaxt);
    expect(PLAN_MAX_USERS.tillvaxt).toBeLessThan(PLAN_MAX_USERS.professionell);
  });

  describe("maxUsersForPlan", () => {
    it("returns the tier's default seat count", () => {
      expect(maxUsersForPlan("start")).toBe(PLAN_MAX_USERS.start);
      expect(maxUsersForPlan("tillvaxt")).toBe(PLAN_MAX_USERS.tillvaxt);
      expect(maxUsersForPlan("professionell")).toBe(PLAN_MAX_USERS.professionell);
    });

    it("returns null (unlimited) for no plan or an unknown tier", () => {
      expect(maxUsersForPlan(null)).toBeNull();
      expect(maxUsersForPlan(undefined)).toBeNull();
      expect(maxUsersForPlan("")).toBeNull();
      expect(maxUsersForPlan("enterprise")).toBeNull();
    });
  });

  it("promises a 30-day trial", () => {
    expect(TRIAL_DAYS).toBe(30);
  });
});
