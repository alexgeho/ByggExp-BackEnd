import {
  computeReminder,
  DEFAULT_REMINDER_FEE_SEK,
  LATE_INTEREST_MARKUP,
} from './reminder-math';

describe('computeReminder', () => {
  const now = new Date('2026-09-11T12:00:00Z');

  it('accrues dröjsmålsränta at referensränta + 8% and adds the fee', () => {
    // 30 days overdue on 10 000 kr, reference rate 2% -> 10% p.a.
    const r = computeReminder({
      principal: 10000,
      dueDate: '2026-08-12',
      now,
      referenceRatePercent: 2,
      feeSek: 60,
    });
    expect(r.daysOverdue).toBe(30);
    expect(r.interestRatePercent).toBe(10);
    // 10000 * 0.10 * 30/365 = 82.19
    expect(r.interest).toBeCloseTo(82.19, 2);
    expect(r.fee).toBe(60);
    expect(r.newTotal).toBeCloseTo(10142.19, 2);
  });

  it('is zero interest when not yet overdue', () => {
    const r = computeReminder({ principal: 5000, dueDate: '2026-10-01', now, referenceRatePercent: 2 });
    expect(r.daysOverdue).toBe(0);
    expect(r.interest).toBe(0);
    expect(r.fee).toBe(DEFAULT_REMINDER_FEE_SEK);
    expect(r.newTotal).toBe(5060);
  });

  it('defaults markup to 8 points above the reference rate', () => {
    const r = computeReminder({ principal: 1000, dueDate: '2026-09-01', now, referenceRatePercent: 3.5 });
    expect(r.interestRatePercent).toBe(3.5 + LATE_INTEREST_MARKUP);
  });
});
