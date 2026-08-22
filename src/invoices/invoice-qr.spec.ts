import { buildInvoiceQrDataUrl } from './invoice-qr';

describe('buildInvoiceQrDataUrl', () => {
  it('returns an empty string when no giro account is set', async () => {
    const url = await buildInvoiceQrDataUrl({
      companyName: 'Geal Entreprenad AB',
      orgNumber: '559303-7566',
      amount: 1000,
    });
    expect(url).toBe('');
  });

  it('returns an empty string when the giro is only whitespace', async () => {
    const url = await buildInvoiceQrDataUrl({ bankgiro: '   ', amount: 1000 });
    expect(url).toBe('');
  });

  it('returns a PNG data URL when a bankgiro is set', async () => {
    const url = await buildInvoiceQrDataUrl({
      companyName: 'Geal Entreprenad AB',
      orgNumber: '559303-7566',
      ocr: '398',
      invoiceDate: '2026-08-13',
      dueDate: '2026-09-12',
      amount: 166320,
      bankgiro: '256-7030',
    });
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(url.length).toBeGreaterThan(100);
  });

  it('also builds a QR from a plusgiro when there is no bankgiro', async () => {
    const url = await buildInvoiceQrDataUrl({
      companyName: 'X',
      amount: 500,
      plusgiro: '12 34 56-7',
    });
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
  });
});
