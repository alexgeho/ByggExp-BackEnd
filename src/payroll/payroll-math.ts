// Pure payroll math, extracted for unit testing.
export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function computeLineAmounts(
  hours: number,
  rate: number,
  multiplier: number,
  taxRate: number,
): { gross: number; tax: number; net: number } {
  const gross = round2(hours * rate * multiplier);
  const tax = round2(gross * (taxRate / 100));
  return { gross, tax, net: round2(gross - tax) };
}

export function computeRunTotals(
  lines: Array<{ hours?: number; amount?: number; tax?: number; net?: number }>,
  employerRate: number,
): {
  totalHours: number;
  totalGross: number;
  totalTax: number;
  totalNet: number;
  employerContribution: number;
  totalEmployerCost: number;
} {
  const totalHours = round2(lines.reduce((s, l) => s + (Number(l.hours) || 0), 0));
  const totalGross = round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const totalTax = round2(lines.reduce((s, l) => s + (Number(l.tax) || 0), 0));
  const totalNet = round2(lines.reduce((s, l) => s + (Number(l.net) || 0), 0));
  const employerContribution = round2(totalGross * (employerRate / 100));
  return {
    totalHours,
    totalGross,
    totalTax,
    totalNet,
    employerContribution,
    totalEmployerCost: round2(totalGross + employerContribution),
  };
}
