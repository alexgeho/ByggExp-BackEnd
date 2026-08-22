import { buildInvoicePdfHtmlPuppeteer, InvoicePdfData } from './templates/invoice-pdf.template';

const footer = {
  name: 'Geal Entreprenad AB',
  address: 'Byggmästarvägen 18',
  city: '168 32 Bromma',
  phone: '+46707577574',
  email: 'mg@gealab.nu',
  website: 'gealan.nu',
  orgNumber: '559303-7566',
  vatNumber: 'SE559303-756601',
  vatStatus: 'Godkänd för F-skatt',
  bankgiro: '256-7030',
};

const base: InvoicePdfData = {
  invoiceNumber: '39',
  companyName: 'Svensson Fastigheter AB',
  address: 'Kungsportsavenyen 21',
  postalCode: '411 36 Göteborg',
  date: '2026-08-13',
  dueDate: '2026-09-12',
  ocr: '398',
  companyFooter: footer,
};

const pageCount = (html: string) => (html.match(/class="invoice-page"/g) || []).length;

const oneItem = [{ articleNumber: '1', description: 'Arbete', quantity: 336, unit: 'h', price: 495, vatRate: 25 }];

describe('invoice PDF template', () => {
  it('renders a single page for one line item, with the summary', () => {
    const html = buildInvoicePdfHtmlPuppeteer({ ...base, items: oneItem });
    expect(pageCount(html)).toBe(1);
    expect(html).toContain('Sida 1(1)');
    expect(html).toContain('Att betala');
    expect(html).toContain('Exkl. moms');
  });

  it('paginates many line items across multiple pages', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      articleNumber: String(i + 1), description: `Rad ${i + 1}`, quantity: 1, unit: 'st', price: 1000, vatRate: 25,
    }));
    const html = buildInvoicePdfHtmlPuppeteer({ ...base, items: many });
    expect(pageCount(html)).toBeGreaterThan(1);
    // Page numbering reflects the real total.
    expect(html).toContain(`Sida 1(${pageCount(html)})`);
  });

  it('shows the reverse-VAT notice and 0% VAT when reverseVAT is on', () => {
    const html = buildInvoicePdfHtmlPuppeteer({ ...base, items: oneItem, reverseVAT: 'true' });
    expect(html).toContain('Omvänd skattskyldighet för byggtjänster gäller');
    expect(html).toContain('Moms (0 %)');
  });

  it('puts F-skatt under Organisationsnr and the VAT number under Momsreg.nr', () => {
    const html = buildInvoicePdfHtmlPuppeteer({ ...base, items: oneItem });
    expect(html).toContain('<b>Organisationsnr</b>559303-7566<br>Godkänd för F-skatt');
    expect(html).toContain('<b>Momsreg.nr</b>SE559303-756601');
  });

  it('renders the payment QR and Bankgiro line when provided', () => {
    const html = buildInvoicePdfHtmlPuppeteer(
      { ...base, items: oneItem, qrDataUrl: 'data:image/png;base64,AAA' },
    );
    expect(html).toContain('class="invoice-paybox__qr"');
    expect(html).toContain('Bankgiro');
    expect(html).toContain('256-7030');
  });

  it('renders "Kreditfaktura" for a credit note', () => {
    const html = buildInvoicePdfHtmlPuppeteer({ ...base, items: oneItem, creditOfNumber: 12 });
    expect(html).toContain('Kreditfaktura');
    expect(html).toContain('Avser faktura');
  });

  it('renders a text row spanning the description with no amount', () => {
    const html = buildInvoicePdfHtmlPuppeteer({
      ...base,
      items: [...oneItem, { isText: true, description: 'Tillkommande arbeten' }],
    });
    expect(html).toContain('invoice-lines__text');
    expect(html).toContain('colspan="5"');
    expect(html).toContain('Tillkommande arbeten');
  });

  it('places text rows under the priced rows regardless of input order', () => {
    const html = buildInvoicePdfHtmlPuppeteer({
      ...base,
      items: [
        { isText: true, description: 'RUBRIK' },
        { articleNumber: '1', description: 'Arbete', quantity: 1, unit: 'h', price: 500, vatRate: 25 },
      ],
    });
    expect(html.indexOf('Arbete')).toBeLessThan(html.indexOf('RUBRIK'));
  });
});
