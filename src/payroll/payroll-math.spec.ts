import { computeLineAmounts, computeRunTotals } from './payroll-math';

describe('computeLineAmounts', () => {
  it('computes gross, tax and net at a flat tax rate', () => {
    const r = computeLineAmounts(16, 350, 1, 30);
    expect(r.gross).toBe(5600);
    expect(r.tax).toBe(1680);
    expect(r.net).toBe(3920);
  });

  it('applies an OB/overtime multiplier to gross', () => {
    const r = computeLineAmounts(10, 300, 1.5, 30);
    expect(r.gross).toBe(4500);
    expect(r.net).toBe(3150);
  });
});

describe('computeRunTotals', () => {
  it('aggregates lines and adds employer contribution', () => {
    const lines = [
      { hours: 16, amount: 5600, tax: 1680, net: 3920 },
      { hours: 16, amount: 5120, tax: 1536, net: 3584 },
    ];
    const t = computeRunTotals(lines, 31.42);
    expect(t.totalHours).toBe(32);
    expect(t.totalGross).toBe(10720);
    expect(t.totalTax).toBe(3216);
    expect(t.totalNet).toBe(7504);
    expect(t.employerContribution).toBe(3368.22);
    expect(t.totalEmployerCost).toBe(14088.22);
  });
});
