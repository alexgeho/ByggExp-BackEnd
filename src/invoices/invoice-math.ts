// Pure money math for invoices, extracted so it can be unit-tested without the
// Nest/Mongoose machinery. The service delegates to these.

export type MoneyItem = {
  quantity?: number;
  price?: number;
  discount?: number;
  vatRate?: number;
  // Text-only rows (headings / notes placed between priced rows) carry no
  // amount and never affect the totals.
  isText?: boolean;
};

export type InvoiceTotals = { subtotal: number; vat: number; total: number };

export const ROT_RATE = 0.3;
export const ROT_MAX = 50000;

// Skattereduktion kinds. The invoice keeps its rot* fields for all of them;
// deductionType picks the rate, cap and the label on the PDF.
export const DEDUCTION_TYPES = {
  rot: { rate: ROT_RATE, max: ROT_MAX, label: 'ROT-avdrag' },
  rut: { rate: 0.5, max: 75000, label: 'RUT-avdrag' },
  green15: { rate: 0.15, max: 50000, label: 'Grön teknik (solceller)' },
  green50: { rate: 0.5, max: 50000, label: 'Grön teknik (batteri/laddpunkt)' },
} as const;

export type DeductionType = keyof typeof DEDUCTION_TYPES;

export const deductionMeta = (type?: string) =>
  DEDUCTION_TYPES[(type as DeductionType) in DEDUCTION_TYPES ? (type as DeductionType) : 'rot'];

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function calculateInvoiceTotals(
  items: MoneyItem[] = [],
  reverseVAT = false,
): InvoiceTotals {
  let subtotal = 0;
  let vat = 0;
  for (const item of items) {
    if (item?.isText) continue;
    const quantity = Number(item?.quantity ?? 0);
    const price = Number(item?.price ?? 0);
    const discount = Number(item?.discount ?? 0);
    const vatRate = Number(item?.vatRate ?? 25);
    const net = quantity * price * (1 - discount / 100);
    subtotal += net;
    if (!reverseVAT) {
      vat += net * (vatRate / 100);
    }
  }
  return { subtotal, vat, total: subtotal + vat };
}

export function deriveInvoiceSettlement(
  total: number,
  opts: { rotEnabled?: boolean; rotLaborAmount?: number; deductionType?: string } = {},
): { rotDeduction: number; rounding: number; roundedTotal: number } {
  const { rate, max } = deductionMeta(opts.deductionType);
  const rotDeduction = opts.rotEnabled
    ? Math.min(round2(rate * (Number(opts.rotLaborAmount) || 0)), max)
    : 0;
  const payable = total - rotDeduction;
  const roundedTotal = Math.round(payable);
  return { rotDeduction, rounding: round2(roundedTotal - payable), roundedTotal };
}
