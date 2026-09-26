import {
  INCLUDED_SEATS,
  PLAN_MAX_USERS,
  TRIAL_DAYS,
  isAddon,
  isInterval,
  isKnownPlan,
  isPerSeat,
  isPlanTier,
  maxUsersForPlan,
  quantityFor,
} from "./plans";

describe("plans — tiers & seat limits", () => {
  it("recognises the three self-serve tiers and rejects anything else", () => {
    expect(isPlanTier("faktura")).toBe(true);
    expect(isPlanTier("projekt")).toBe(true);
    expect(isPlanTier("komplett")).toBe(true);
    expect(isPlanTier("start")).toBe(false); // legacy, not sold any more
    expect(isPlanTier("anpassad")).toBe(false); // contact-only
    expect(isPlanTier(null)).toBe(false);
    expect(isPlanTier(undefined)).toBe(false);
    expect(isPlanTier(42)).toBe(false);
  });

  it("still knows the legacy tiers for companies that carry one", () => {
    expect(isKnownPlan("start")).toBe(true);
    expect(isKnownPlan("tillvaxt")).toBe(true);
    expect(isKnownPlan("professionell")).toBe(true);
    expect(isKnownPlan("komplett")).toBe(true);
    expect(isKnownPlan("basic")).toBe(false);
  });

  it("validates billing intervals and add-ons", () => {
    expect(isInterval("monthly")).toBe(true);
    expect(isInterval("yearly")).toBe(true);
    expect(isInterval("weekly")).toBe(false);
    expect(isAddon("integrations")).toBe(true);
    expect(isAddon("sms")).toBe(false);
  });

  it("bills projekt and komplett per seat, faktura flat", () => {
    expect(isPerSeat("projekt")).toBe(true);
    expect(isPerSeat("komplett")).toBe(true);
    expect(isPerSeat("faktura")).toBe(false);
    expect(isPerSeat(null)).toBe(false);
    expect(INCLUDED_SEATS).toBe(10);
  });

  describe("quantityFor", () => {
    it("uses the seat count for per-seat tiers, at least 1", () => {
      expect(quantityFor("komplett", 23)).toBe(23);
      expect(quantityFor("projekt", 0)).toBe(1);
    });
    it("is always 1 for flat tiers", () => {
      expect(quantityFor("faktura", 23)).toBe(1);
    });
  });

  describe("maxUsersForPlan", () => {
    it("caps faktura at 2 and leaves per-seat tiers uncapped", () => {
      expect(maxUsersForPlan("faktura")).toBe(2);
      expect(maxUsersForPlan("projekt")).toBeNull();
      expect(maxUsersForPlan("komplett")).toBeNull();
    });

    it("keeps the legacy seat limits", () => {
      expect(maxUsersForPlan("start")).toBe(PLAN_MAX_USERS.start);
      expect(maxUsersForPlan("professionell")).toBe(40);
    });

    it("returns null (unlimited) for no plan or an unknown tier", () => {
      expect(maxUsersForPlan(null)).toBeNull();
      expect(maxUsersForPlan(undefined)).toBeNull();
      expect(maxUsersForPlan("")).toBeNull();
      expect(maxUsersForPlan("enterprise")).toBeNull();
    });
  });

  it("gives a 2-week trial", () => {
    expect(TRIAL_DAYS).toBe(14);
  });
});
