// Pure totals math for offers, extracted for unit testing.
export type OfferMoneyItem = {
  quantity?: number;
  price?: number;
  discount?: number;
  vatRate?: number;
};

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function computeOfferTotals(
  items: OfferMoneyItem[] = [],
): { subtotal: number; vat: number; total: number } {
  let subtotal = 0;
  let vat = 0;
  for (const it of items) {
    const q = Number(it?.quantity || 0);
    const p = Number(it?.price || 0);
    const d = Number(it?.discount || 0);
    const r = Number(it?.vatRate ?? 25);
    const net = q * p * (1 - d / 100);
    subtotal += net;
    vat += net * (r / 100);
  }
  return { subtotal: round2(subtotal), vat: round2(vat), total: round2(subtotal + vat) };
}
