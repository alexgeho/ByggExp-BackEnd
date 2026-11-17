import { buildOfferPdfHtml, OfferPdfData } from './templates/offer-pdf.template';

const base: OfferPdfData = {
  offerNumber: '1',
  companyName: 'Kund AB',
  items: [],
  subtotal: 0,
  vat: 0,
  total: 0,
};

describe('offer PDF rich-text rendering', () => {
  it('renders plain-text description with <br> for newlines', () => {
    const html = buildOfferPdfHtml({ ...base, description: 'Rad 1\nRad 2' });
    expect(html).toContain('Rad 1<br>Rad 2');
  });

  it('keeps safe formatting (lists, bold) from the editor', () => {
    const html = buildOfferPdfHtml({
      ...base,
      description: '<ul><li>A</li><li>B</li></ul><strong>C</strong>',
    });
    expect(html).toContain('<ul><li>A</li><li>B</li></ul>');
    expect(html).toContain('<strong>C</strong>');
  });

  it('strips dangerous tags but keeps surrounding text', () => {
    const html = buildOfferPdfHtml({
      ...base,
      clarifications: '<script>alert(1)</script><p>ok</p>',
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('<p>ok</p>');
  });

  it('renders the article number column for line items', () => {
    const html = buildOfferPdfHtml({
      ...base,
      items: [{ articleNumber: '42', description: 'Arbete', quantity: 1, unit: 'st', price: 100, vatRate: 25 }],
    });
    expect(html).toContain('<th>Art.nr</th>');
    expect(html).toContain('>42<');
  });
});

describe('offer PDF recipient block', () => {
  it('prints only the customer details that are filled in', () => {
    const html = buildOfferPdfHtml({
      ...base,
      contactPerson: 'Anna Berg',
      address: 'Storgatan 1',
      postalCode: '111 22',
      city: 'Stockholm',
      orgNumber: '556000-0000',
      phone: '070-123 45 67',
    });
    expect(html).toContain('Kund AB<br>');
    expect(html).toContain('Anna Berg');
    expect(html).toContain('Storgatan 1');
    expect(html).toContain('111 22 Stockholm');
    expect(html).toContain('Org.nr 556000-0000');
    expect(html).toContain('070-123 45 67');
  });

  it('prints a personal number, not an org number, for a private customer', () => {
    const html = buildOfferPdfHtml({
      ...base,
      clientType: 'private',
      orgNumber: '850101-1234',
      contactPerson: 'Should not print',
    });
    expect(html).toContain('Personnr 850101-1234');
    expect(html).not.toContain('Org.nr');
    expect(html).not.toContain('Should not print');
  });

  it('adds nothing when only the name is known', () => {
    const html = buildOfferPdfHtml(base);
    expect(html).not.toContain('Org.nr');
    expect(html).toMatch(/Kund AB<br>\s*&nbsp;/);
  });
});
