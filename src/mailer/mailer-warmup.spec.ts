import {
  capForDay,
  dailyCap,
  daysToTarget,
  inSendWindow,
  minuteBudget,
  stockholmTime,
  WarmupSettings,
} from "./mailer-warmup";

const base: WarmupSettings = {
  warmupEnabled: true,
  warmupStartedAt: new Date("2026-10-05T06:00:00Z"),
  warmupStartPerDay: 20,
  warmupGrowthPct: 25,
  warmupTargetPerDay: 300,
  sendWindowEnabled: true,
  sendHourFrom: 8,
  sendHourTo: 17,
  weekdaysOnly: true,
  ratePerHour: 30,
};

describe("mailer warm-up", () => {
  it("grows the daily cap and stops at the target", () => {
    expect(capForDay(base, 0)).toBe(20);
    expect(capForDay(base, 1)).toBe(25);
    expect(capForDay(base, 7)).toBe(95);
    expect(capForDay(base, 60)).toBe(300);
    expect(daysToTarget(base)).toBe(13);
  });

  it("has no daily cap when warm-up is off", () => {
    expect(dailyCap({ ...base, warmupEnabled: false }, new Date())).toBeNull();
    expect(dailyCap(base, new Date("2026-10-06T10:00:00Z"))).toBe(25);
  });

  it("uses Stockholm time for the send window and weekends", () => {
    // 2026-10-05 is a Monday. 07:30 UTC = 09:30 in Stockholm (CEST).
    expect(stockholmTime(new Date("2026-10-05T07:30:00Z")).hour).toBe(9);
    expect(inSendWindow(base, new Date("2026-10-05T07:30:00Z"))).toBe(true);
    expect(inSendWindow(base, new Date("2026-10-05T05:30:00Z"))).toBe(false);
    expect(inSendWindow(base, new Date("2026-10-05T15:30:00Z"))).toBe(false);
    expect(inSendWindow(base, new Date("2026-10-10T09:00:00Z"))).toBe(false);
    expect(
      inSendWindow(
        { ...base, sendWindowEnabled: false },
        new Date("2026-10-10T09:00:00Z"),
      ),
    ).toBe(true);
  });

  it("spreads the remaining daily cap over the rest of the window", () => {
    // 08:00 Stockholm, 20 left, 540 minutes left → mostly 0, sometimes 1.
    const at8 = new Date("2026-10-05T06:00:00Z");
    expect(minuteBudget(base, at8, 20, () => 0.99)).toBe(0);
    expect(minuteBudget(base, at8, 20, () => 0)).toBe(1);
    // 16:59, plenty left → capped by ratePerHour (30/h = 1/min).
    const late = new Date("2026-10-05T14:59:00Z");
    expect(minuteBudget(base, late, 50, () => 0.5)).toBe(1);
    expect(minuteBudget(base, at8, 0)).toBe(0);
    expect(minuteBudget({ ...base, ratePerHour: 120 }, at8, null)).toBe(2);
  });
});
