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
  const totalHours = round2(
    lines.reduce((s, l) => s + (Number(l.hours) || 0), 0),
  );
  const totalGross = round2(
    lines.reduce((s, l) => s + (Number(l.amount) || 0), 0),
  );
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

// ---- Manual payroll (no shifts) -------------------------------------------
// One worker's pay entered by hand: hour rows (normal / övertid / OB) at a
// timlön, a fixed månadslön and other rows (bonus, avdrag). Factor is 1 for
// every hour type, same as runs from the hours grid — the admin enters the
// övertid/OB rate itself.

export const HOUR_ITEM_TYPES = ["normal", "overtime", "ob"] as const;
export const AMOUNT_ITEM_TYPES = ["monthly", "other"] as const;
export const MANUAL_ITEM_TYPES = [...HOUR_ITEM_TYPES, ...AMOUNT_ITEM_TYPES];
export type ManualItemType = (typeof MANUAL_ITEM_TYPES)[number];

export type ManualItemInput = {
  type: string;
  label?: string;
  hours?: number;
  rate?: number;
  amount?: number;
};

export type ManualItem = {
  type: ManualItemType;
  label: string;
  hours: number;
  rate: number;
  multiplier: number;
  amount: number;
};

export const isHourItem = (type: string) =>
  (HOUR_ITEM_TYPES as readonly string[]).includes(type);

// Items → priced rows + the worker's line figures. Hour rows without a rate
// use `defaultRate` (the worker's stored timlön). Empty rows are dropped.
export function computeManualItems(
  input: ManualItemInput[],
  defaultRate: number,
): {
  items: ManualItem[];
  hours: number;
  rate: number;
  hourType: string;
  gross: number;
} {
  const items: ManualItem[] = [];
  for (const i of input || []) {
    if (!(MANUAL_ITEM_TYPES as readonly string[]).includes(i.type)) continue;
    const type = i.type as ManualItemType;
    const label = String(i.label || "").trim();
    if (isHourItem(type)) {
      const hours = round2(i.hours ?? 0);
      const rate = round2(i.rate ?? defaultRate);
      if (!hours) continue;
      const { gross } = computeLineAmounts(hours, rate, 1, 0);
      items.push({ type, label, hours, rate, multiplier: 1, amount: gross });
    } else {
      const amount = round2(i.amount ?? 0);
      if (!amount) continue;
      items.push({ type, label, hours: 0, rate: 0, multiplier: 1, amount });
    }
  }
  const hourItems = items.filter((i) => isHourItem(i.type));
  const types = [...new Set(items.map((i) => i.type))];
  return {
    items,
    hours: round2(hourItems.reduce((s, i) => s + i.hours, 0)),
    rate:
      (hourItems.find((i) => i.type === "normal") || hourItems[0])?.rate ?? 0,
    hourType: types.length === 1 ? types[0] : "mixed",
    gross: round2(items.reduce((s, i) => s + i.amount, 0)),
  };
}
