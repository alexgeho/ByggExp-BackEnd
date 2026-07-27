import { computeOfferTotals } from './offer-math';

describe('computeOfferTotals', () => {
  it('matches the invoice math so offer→invoice agrees', () => {
    const t = computeOfferTotals([{ quantity: 40, price: 650, vatRate: 25 }]);
    expect(t).toEqual({ subtotal: 26000, vat: 6500, total: 32500 });
  });

  it('rounds to 2 decimals', () => {
    const t = computeOfferTotals([{ quantity: 3, price: 33.33, vatRate: 25 }]);
    expect(t.subtotal).toBe(99.99);
    expect(t.vat).toBe(25);
  });

  it('returns zeros for no items', () => {
    expect(computeOfferTotals()).toEqual({ subtotal: 0, vat: 0, total: 0 });
  });
});
