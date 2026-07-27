export type OfferPdfCompanyFooter = {
  name?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  orgNumber?: string;
  vatNumber?: string;
  vatStatus?: string;
};

export type OfferPdfContactPerson = {
  role?: string;
  name?: string;
};

export type OfferPdfItem = {
  description?: string;
  quantity?: number;
  unit?: string;
  price?: number;
  discount?: number;
  vatRate?: number;
};

export type OfferPdfData = {
  offerNumber?: string;
  companyName?: string;
  email?: string;
  date?: string;
  validUntil?: string;
  subtitle?: string;
  priceText?: string;
  description?: string;
  clarifications?: string;
  contactPersons?: OfferPdfContactPerson[];
  items?: OfferPdfItem[];
  subtotal?: number;
  vat?: number;
  total?: number;
  companyFooter?: OfferPdfCompanyFooter;
};

const OFFER_PDF_CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: Helvetica, Arial, sans-serif;
  font-size: 15px;
  line-height: 1.4;
  color: #1b2a3a;
  background: white;
}
.offer-page {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  padding: 15mm 15mm 8mm;
}
.offer-header {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  align-items: start;
  gap: 12px;
  margin-bottom: 18px;
}
.offer-header__logo img { max-height: 110px; max-width: 100%; object-fit: contain; display: block; }
.offer-header__title { font-size: 26px; font-weight: bold; margin-bottom: 6px; }
.offer-header__recipient { font-size: 13px; }
.offer-header__meta { display: grid; grid-template-columns: max-content 1fr; column-gap: 10px; row-gap: 2px; font-size: 13px; margin: 0; }
.offer-header__meta dt { font-weight: bold; }
.offer-header__meta dd { margin: 0; }
.offer-body { flex: 1; }
.offer-subtitle { font-size: 19px; font-weight: bold; margin: 4px 0 14px; }
.offer-section { margin: 0 0 18px; }
.offer-section__title { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; margin: 0 0 4px; }
.offer-section__text { white-space: pre-wrap; word-break: break-word; }
.offer-price {
  border: 1px solid #1b2a3a;
  background: antiquewhite;
  padding: 12px 14px;
  font-size: 18px;
  font-weight: bold;
  margin: 0 0 18px;
  white-space: pre-wrap;
}
.offer-items { width: 100%; border-collapse: collapse; margin: 0 0 14px; font-size: 13px; }
.offer-items th {
  text-align: left; border-bottom: 1.5px solid #1b2a3a; padding: 6px 8px;
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b;
}
.offer-items td { padding: 7px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.offer-items .num { text-align: right; white-space: nowrap; }
.offer-totals { width: 100%; margin: 0 0 18px; }
.offer-totals table { margin-left: auto; border-collapse: collapse; font-size: 14px; }
.offer-totals td { padding: 3px 0 3px 24px; text-align: right; }
.offer-totals .grand td { border-top: 1.5px solid #1b2a3a; font-size: 17px; font-weight: bold; padding-top: 7px; }
.offer-contacts { margin: 0 0 18px; }
.offer-contacts__row { font-size: 14px; }
.offer-footer {
  margin-top: auto;
  border-top: 1px solid #1b2a3a;
  padding-top: 8px;
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 4px;
  font-size: 13px;
}
.offer-footer td { width: 25%; vertical-align: top; padding: 0; border: none; }
`;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function text(value?: string | number | null): string {
  if (value === null || value === undefined) return '';
  return escapeHtml(String(value));
}

function multiline(value?: string): string {
  return text(value);
}

function section(title: string, body: string): string {
  if (!body || !body.trim()) return '';
  return `
    <div class="offer-section">
      <p class="offer-section__title">${title}</p>
      <div class="offer-section__text">${multiline(body)}</div>
    </div>
  `;
}

function money(value?: number): string {
  return new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function buildItemsHtml(items: OfferPdfItem[], data: OfferPdfData): string {
  const rows = items
    .map((it) => {
      const q = Number(it.quantity || 0);
      const p = Number(it.price || 0);
      const d = Number(it.discount || 0);
      const amount = q * p * (1 - d / 100);
      return `
        <tr>
          <td>${multiline(it.description || '')}</td>
          <td class="num">${money(q).replace(',00', '')}</td>
          <td>${text(it.unit || 'st')}</td>
          <td class="num">${money(p)}</td>
          <td class="num">${money(amount)}</td>
        </tr>`;
    })
    .join('');

  return `
    <table class="offer-items">
      <thead>
        <tr>
          <th>Beskrivning</th>
          <th class="num">Antal</th>
          <th>Enhet</th>
          <th class="num">Á-pris</th>
          <th class="num">Belopp</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="offer-totals">
      <table>
        <tr><td>Summa exkl. moms</td><td>${money(data.subtotal)} kr</td></tr>
        <tr><td>Moms</td><td>${money(data.vat)} kr</td></tr>
        <tr class="grand"><td>Att betala</td><td>${money(data.total)} kr</td></tr>
      </table>
    </div>`;
}

function buildFooter(footer: OfferPdfCompanyFooter = {}): string {
  return `
    <table class="offer-footer">
      <tr>
        <td><b>Adress</b><br>${text(footer.name)}<br>${text(footer.address)}<br>${text(footer.city)}</td>
        <td><b>Telefon</b><br>${text(footer.phone)}<br><b>E-post</b><br>${text(footer.email)}</td>
        <td><b>Webbplats</b><br>${text(footer.website)}<br><b>Organisationsnr</b><br>${text(footer.orgNumber)}</td>
        <td><b>Momsreg.nr</b><br>${text(footer.vatNumber)}<br>${text(footer.vatStatus)}</td>
      </tr>
    </table>
  `;
}

export function buildOfferPdfHtml(data: OfferPdfData, logoDataUrl = ''): string {
  const logo = logoDataUrl ? `<img src="${logoDataUrl}" alt="" />` : '';
  const contacts = (data.contactPersons || []).filter((c) => c && (c.name || c.role));
  const contactsHtml = contacts.length
    ? `
      <div class="offer-contacts">
        <p class="offer-section__title">Kontaktpersoner</p>
        ${contacts
          .map(
            (c) =>
              `<div class="offer-contacts__row">${text(c.name)}${c.role ? ` — ${text(c.role)}` : ''}</div>`,
          )
          .join('')}
      </div>`
    : '';

  const items = (data.items || []).filter(
    (it) => it && (String(it.description || '').trim() || Number(it.price) || Number(it.quantity)),
  );

  const priceHtml = items.length
    ? buildItemsHtml(items, data)
    : data.priceText && data.priceText.trim()
      ? `<div class="offer-price">${multiline(data.priceText)}</div>`
      : '';

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <title>Offert ${text(data.offerNumber)}</title>
  <style>${OFFER_PDF_CSS}</style>
</head>
<body>
  <main class="offer-page">
    <header class="offer-header">
      <div class="offer-header__logo">${logo}</div>
      <div>
        <div class="offer-header__title">Offert</div>
        <div class="offer-header__recipient">
          ${text(data.companyName) || '&nbsp;'}<br>
          ${text(data.email) || '&nbsp;'}
        </div>
      </div>
      <dl class="offer-header__meta">
        <dt>Offertnr</dt><dd>${text(data.offerNumber) || '&nbsp;'}</dd>
        <dt>Datum</dt><dd>${text(data.date) || '&nbsp;'}</dd>
        <dt>Giltig till</dt><dd>${text(data.validUntil) || '&nbsp;'}</dd>
      </dl>
    </header>

    <div class="offer-body">
      ${data.subtitle ? `<h1 class="offer-subtitle">${text(data.subtitle)}</h1>` : ''}
      ${section('Beskrivning', data.description || '')}
      ${priceHtml}
      ${section('Förtydliganden', data.clarifications || '')}
      ${contactsHtml}
    </div>

    ${buildFooter(data.companyFooter)}
  </main>
</body>
</html>`;
}
