// Pure money math for invoices, extracted so it can be unit-tested without the
// Nest/Mongoose machinery. The service delegates to these.

export type MoneyItem = {
  quantity?: number;
  price?: number;
  discount?: number;
  vatRate?: number;
};

export type InvoiceTotals = { subtotal: number; vat: number; total: number };

export const ROT_RATE = 0.3;
export const ROT_MAX = 50000;

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function calculateInvoiceTotals(
  items: MoneyItem[] = [],
  reverseVAT = false,
): InvoiceTotals {
  let subtotal = 0;
  let vat = 0;
  for (const item of items) {
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
  opts: { rotEnabled?: boolean; rotLaborAmount?: number } = {},
): { rotDeduction: number; rounding: number; roundedTotal: number } {
  const rotDeduction = opts.rotEnabled
    ? Math.min(round2(ROT_RATE * (Number(opts.rotLaborAmount) || 0)), ROT_MAX)
    : 0;
  const payable = total - rotDeduction;
  const roundedTotal = Math.round(payable);
  return { rotDeduction, rounding: round2(roundedTotal - payable), roundedTotal };
}
