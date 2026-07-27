import {
  calculateInvoiceTotals,
  deriveInvoiceSettlement,
  ROT_MAX,
} from './invoice-math';

describe('calculateInvoiceTotals', () => {
  it('sums quantity × price with default 25% VAT', () => {
    const t = calculateInvoiceTotals([{ quantity: 40, price: 650, vatRate: 25 }]);
    expect(t.subtotal).toBe(26000);
    expect(t.vat).toBe(6500);
    expect(t.total).toBe(32500);
  });

  it('applies per-line discount', () => {
    const t = calculateInvoiceTotals([{ quantity: 2, price: 100, discount: 10, vatRate: 25 }]);
    expect(t.subtotal).toBe(180);
    expect(t.vat).toBe(45);
  });

  it('mixes VAT rates across lines', () => {
    const t = calculateInvoiceTotals([
      { quantity: 1, price: 100, vatRate: 25 },
      { quantity: 1, price: 100, vatRate: 12 },
    ]);
    expect(t.subtotal).toBe(200);
    expect(t.vat).toBe(37);
  });

  it('zeroes VAT under reverse charge', () => {
    const t = calculateInvoiceTotals([{ quantity: 1, price: 100, vatRate: 25 }], true);
    expect(t.vat).toBe(0);
    expect(t.total).toBe(100);
  });

  it('handles an empty list', () => {
    expect(calculateInvoiceTotals([])).toEqual({ subtotal: 0, vat: 0, total: 0 });
  });
});

describe('deriveInvoiceSettlement', () => {
  it('is a no-op without ROT (only öresavrundning)', () => {
    const s = deriveInvoiceSettlement(32500);
    expect(s.rotDeduction).toBe(0);
    expect(s.roundedTotal).toBe(32500);
    expect(s.rounding).toBe(0);
  });

  it('rounds öre to the nearest krona', () => {
    const s = deriveInvoiceSettlement(100.49);
    expect(s.roundedTotal).toBe(100);
    expect(s.rounding).toBeCloseTo(-0.49, 5);
  });

  it('deducts 30% of labour for ROT', () => {
    const s = deriveInvoiceSettlement(32500, { rotEnabled: true, rotLaborAmount: 20000 });
    expect(s.rotDeduction).toBe(6000);
    expect(s.roundedTotal).toBe(26500);
  });

  it('caps ROT at the yearly maximum', () => {
    const s = deriveInvoiceSettlement(500000, { rotEnabled: true, rotLaborAmount: 300000 });
    expect(s.rotDeduction).toBe(ROT_MAX);
  });
});
