export type InvoicePdfCompanyFooter = {
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

export type InvoicePdfItem = {
  articleNumber?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  price?: number;
  discount?: number;
  vatRate?: number;
};

export type InvoicePdfData = {
  logoUrl?: string | null;
  invoiceNumber?: string;
  companyName?: string;
  vatNumber?: string;
  address?: string;
  postalCode?: string;
  customerNumber?: string;
  date?: string;
  deliveryDate?: string;
  ourReference?: string;
  yourReference?: string;
  orderReference?: string;
  lateInterest?: string;
  reverseVAT?: string;
  items?: InvoicePdfItem[];
  subtotal?: number;
  vat?: number;
  total?: number;
  dueDate?: string;
  ocr?: string;
  companyFooter?: InvoicePdfCompanyFooter;
};

type VatGroup = {
  rate: number;
  base: number;
  amount: number;
};

const INVOICE_PDF_CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: Helvetica, Arial, sans-serif;
  font-size: 15px;
  line-height: 1.3;
  background: white;
}
.invoice-document { width: 210mm; margin: 0 auto; }
.invoice-page {
  width: 210mm;
  height: 297mm;
  min-height: 297mm;
  display: flex;
  flex-direction: column;
  page-break-after: always;
  overflow: hidden;
}
.invoice-page:last-child { page-break-after: auto; }
.invoice-page__header { padding: 4mm 15mm 1mm; }
.invoice-page__body { flex: 1; padding: 0 15mm; }
.invoice-page__footer { margin-top: 8px; padding: 0 15mm 8mm; }
.invoice-header__top {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  align-items: start;
  gap: 12px;
}
.invoice-header__logo img {
  max-height: 120px;
  width: auto;
  height: auto;
  display: block;
  object-fit: contain;
}
.invoice-header__title {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 4px;
}
.invoice-header__address,
.invoice-header__meta,
.invoice-header__details { font-size: 13px; }
.invoice-header__meta,
.invoice-header__details {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 10px;
  row-gap: 2px;
  margin: 0;
}
.invoice-header__meta dt,
.invoice-header__details dt { font-weight: bold; margin: 0; }
.invoice-header__meta dd,
.invoice-header__details dd { margin: 0; }
.invoice-header__bottom {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: end;
  margin: 15px 0;
}
.invoice-lines {
  width: 100%;
  border-collapse: collapse;
  align-self: stretch;
  border: 1px solid black;
  table-layout: fixed;
}
.invoice-lines thead { border-bottom: 1px solid black; }
.invoice-lines th,
.invoice-lines td {
  padding: 5px 8px;
  font-size: 15px;
  vertical-align: top;
}
.invoice-lines th { font-weight: bold; }
.invoice-lines__filler td { padding: 0; line-height: 0; }
.invoice-lines__footer td { vertical-align: bottom; }
.description {
  text-align: left;
  white-space: normal;
  word-break: break-word;
}
.nowrap,
.quantity,
.unit,
.amount { white-space: nowrap; }
.amount {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.r { text-align: right; }
.invoice-summary {
  display: grid;
  grid-template-columns: 1fr auto;
  margin: 0;
  row-gap: 4px;
  border-top: 1px solid black;
  padding-top: 4px;
}
.invoice-summary dt { font-weight: bold; }
.invoice-summary dd { margin: 0; text-align: right; }
.invoice-total-box {
  border: 1px solid black;
  border-bottom: none;
  background: antiquewhite;
  padding: 8px 8px 0;
}
.invoice-total-box dl {
  display: grid;
  grid-template-columns: 1fr auto;
  margin: 0;
  row-gap: 6px;
}
.invoice-total-box dt { font-weight: bold; }
.invoice-total-box dd { margin: 0; text-align: right; }
.invoice-total-box__total {
  font-size: 16px;
  font-weight: bold;
}
.invoice-footer {
  width: 100%;
  border: none;
  border-collapse: separate;
  border-spacing: 0 4px;
  padding: 6px 0 8px;
  font-family: Helvetica, Arial, sans-serif;
  font-size: 15px;
}
.invoice-footer td {
  width: 25%;
  vertical-align: top;
  padding: 0;
  border: none;
}
`;

export function formatInvoiceAmount(value: number): string {
  return new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function text(value?: string | number | null): string {
  if (value === null || value === undefined) {
    return '';
  }
  return escapeHtml(String(value));
}

function multilineText(value?: string): string {
  return text(value).replaceAll('\n', '<br>');
}

function groupVatByRate(items: InvoicePdfItem[]): VatGroup[] {
  const map = new Map<number, { base: number; amount: number }>();

  for (const item of items) {
    const price = typeof item.price === 'number' ? item.price : 0;
    const discount = typeof item.discount === 'number' ? item.discount : 0;
    const quantity = typeof item.quantity === 'number' ? item.quantity : 0;
    const rate = typeof item.vatRate === 'number' ? item.vatRate : 25;
    const lineTotal = quantity * price * (1 - discount / 100);
    const existing = map.get(rate) || { base: 0, amount: 0 };

    existing.base += lineTotal;
    existing.amount += lineTotal * (rate / 100);
    map.set(rate, existing);
  }

  return Array.from(map.entries())
    .map(([rate, values]) => ({ rate, ...values }))
    .sort((a, b) => b.rate - a.rate);
}

function buildHeader(data: InvoicePdfData, logoDataUrl = ''): string {
  const logo = logoDataUrl ? `<img src="${logoDataUrl}" alt="" />` : '';

  return `
    <header class="invoice-header">
      <div class="invoice-header__top">
        <div class="invoice-header__logo">${logo}</div>
        <div>
          <div class="invoice-header__title">Faktura</div>
          <div class="invoice-header__address">
            ${text(data.companyName) || '&nbsp;'}<br>
            ${text(data.address) || '&nbsp;'}<br>
            ${text(data.postalCode) || '&nbsp;'}
          </div>
        </div>
        <dl class="invoice-header__meta">
          <dt>Fakturadatum</dt><dd>${text(data.date) || '&nbsp;'}</dd>
          <dt>Fakturanr</dt><dd>${text(data.invoiceNumber) || '&nbsp;'}</dd>
          <dt>OCR</dt><dd>${text(data.ocr || data.invoiceNumber) || '&nbsp;'}</dd>
        </dl>
      </div>
      <div class="invoice-header__bottom">
        <dl class="invoice-header__details">
          <dt>Kundnr</dt><dd>${text(data.customerNumber) || '&nbsp;'}</dd>
          <dt>Er referens</dt><dd>${text(data.yourReference) || '&nbsp;'}</dd>
          <dt>Er orderreferens</dt><dd>${text(data.orderReference) || '&nbsp;'}</dd>
        </dl>
        <dl class="invoice-header__details">
          <dt>Vår referens</dt><dd>${text(data.ourReference) || '&nbsp;'}</dd>
          <dt>Leveransdatum</dt><dd>${text(data.deliveryDate) || '&nbsp;'}</dd>
          <dt>Förfallodatum</dt><dd>${text(data.dueDate) || '&nbsp;'}</dd>
        </dl>
      </div>
    </header>
  `;
}

function buildItemRows(items: InvoicePdfItem[]): string {
  if (!items.length) {
    return '<tr><td colspan="6">&nbsp;</td></tr>';
  }

  return items
    .map((item) => {
      const price = typeof item.price === 'number' ? item.price : 0;
      const discount = typeof item.discount === 'number' ? item.discount : 0;
      const quantity = typeof item.quantity === 'number' ? item.quantity : 0;
      const total = quantity * price * (1 - discount / 100);

      return `
        <tr class="invoice-lines__item">
          <td>${text(item.articleNumber)}</td>
          <td class="description">${multilineText(item.description)}</td>
          <td class="r nowrap quantity">${formatInvoiceAmount(quantity)}</td>
          <td class="nowrap unit">${text(item.unit || 'st')}</td>
          <td class="r nowrap amount">${formatInvoiceAmount(price)}</td>
          <td class="r nowrap amount">${formatInvoiceAmount(total)}</td>
        </tr>
      `;
    })
    .join('');
}

const MM_TO_PX = 96 / 25.4;
const A4_PAGE_HEIGHT_PX = Math.floor(297 * MM_TO_PX);
const BODY_FONT_SIZE_PX = 15;
const BODY_LINE_HEIGHT = 1.3;
const BODY_LINE_HEIGHT_PX = BODY_FONT_SIZE_PX * BODY_LINE_HEIGHT;
const TABLE_CELL_VERTICAL_PADDING_PX = 10;
const TABLE_ROW_HEIGHT_PX = Math.ceil(BODY_LINE_HEIGHT_PX + TABLE_CELL_VERTICAL_PADDING_PX);
const TABLE_HEADER_HEIGHT_PX = TABLE_ROW_HEIGHT_PX;
const REVERSE_VAT_NOTICE_HEIGHT_PX = TABLE_ROW_HEIGHT_PX;
const HEADER_TOP_SECTION_HEIGHT_PX = 150 + Math.ceil(7 * MM_TO_PX);
const HEADER_DETAILS_ROWS = 7;
const HEADER_DETAILS_GAP_PX = Math.ceil(3 * MM_TO_PX);
const INVOICE_HEADER_HEIGHT_PX = Math.ceil(
  HEADER_TOP_SECTION_HEIGHT_PX
    + (HEADER_DETAILS_ROWS * BODY_LINE_HEIGHT_PX)
    + HEADER_DETAILS_GAP_PX
    + 1,
);
const FOOTER_LINE_COUNT = 4;
const FOOTER_MARGIN_TOP_PX = 8;
const FOOTER_BOTTOM_PADDING_PX = Math.ceil(8 * MM_TO_PX);
const FOOTER_TABLE_PADDING_PX = 14;
const FOOTER_TABLE_ROW_GAP_PX = 4;
const INVOICE_FOOTER_HEIGHT_PX = Math.ceil(
  FOOTER_MARGIN_TOP_PX
    + FOOTER_BOTTOM_PADDING_PX
    + FOOTER_TABLE_PADDING_PX
    + FOOTER_TABLE_ROW_GAP_PX
    + (FOOTER_LINE_COUNT * BODY_LINE_HEIGHT_PX),
);
const INVOICE_TABLE_HEIGHT_PX = Math.max(
  TABLE_ROW_HEIGHT_PX,
  A4_PAGE_HEIGHT_PX - INVOICE_HEADER_HEIGHT_PX - INVOICE_FOOTER_HEIGHT_PX,
);

function calculateSummaryHeightPx(data: InvoicePdfData, isReverseVAT: boolean): number {
  const vatGroups = groupVatByRate(data.items || []);
  const leftLineCount = 1 + (isReverseVAT ? 1 : Math.max(1, vatGroups.length));
  const rightLineCount = 3;
  const leftBlockHeight = 12 + 4 + (leftLineCount * BODY_LINE_HEIGHT_PX)
    + Math.max(0, leftLineCount - 1) * 4;
  const rightBlockHeight = 1 + 8 + (rightLineCount * BODY_LINE_HEIGHT_PX)
    + Math.max(0, rightLineCount - 1) * 6;

  return Math.ceil(Math.max(leftBlockHeight, rightBlockHeight));
}

function calculateReservedTableHeightPx(
  data: InvoicePdfData,
  showSummary: boolean,
  isReverseVAT: boolean,
): number {
  return (
    TABLE_HEADER_HEIGHT_PX
    + (showSummary && isReverseVAT ? REVERSE_VAT_NOTICE_HEIGHT_PX : 0)
    + (showSummary ? calculateSummaryHeightPx(data, isReverseVAT) : 0)
  );
}

function calculateItemsCapacity(
  data: InvoicePdfData,
  showSummary: boolean,
  isReverseVAT: boolean,
): number {
  const reservedHeight = calculateReservedTableHeightPx(data, showSummary, isReverseVAT);
  return Math.floor(Math.max(0, INVOICE_TABLE_HEIGHT_PX - reservedHeight) / TABLE_ROW_HEIGHT_PX);
}

function calculateFillerHeightPx(
  data: InvoicePdfData,
  itemCount: number,
  showSummary: boolean,
  isReverseVAT: boolean,
): number {
  const reservedHeight = calculateReservedTableHeightPx(data, showSummary, isReverseVAT);
  return Math.max(
    0,
    INVOICE_TABLE_HEIGHT_PX - reservedHeight - (itemCount * TABLE_ROW_HEIGHT_PX),
  );
}

function paginateInvoiceItemsByCount(data: InvoicePdfData): Array<{
  items: InvoicePdfItem[];
  showSummary: boolean;
}> {
  const items = data.items || [];
  const isReverseVAT = data.reverseVAT === 'true';
  const fullPageCapacity = Math.max(1, calculateItemsCapacity(data, false, isReverseVAT));
  const lastPageCapacity = Math.max(1, calculateItemsCapacity(data, true, isReverseVAT));

  if (items.length === 0) {
    return [{ items: [], showSummary: true }];
  }

  const pages: Array<{ items: InvoicePdfItem[]; showSummary: boolean }> = [];
  let start = 0;
  let remaining = items.length;

  while (remaining > 0) {
    if (remaining <= lastPageCapacity) {
      pages.push({
        items: items.slice(start),
        showSummary: true,
      });
      break;
    }

    pages.push({
      items: items.slice(start, start + fullPageCapacity),
      showSummary: false,
    });
    start += fullPageCapacity;
    remaining -= fullPageCapacity;
  }

  if (!pages.some((page) => page.showSummary)) {
    pages.push({ items: [], showSummary: true });
  }

  return pages;
}

function buildSummary(data: InvoicePdfData, isReverseVAT: boolean): string {
  const items = data.items || [];
  const vatGroups = groupVatByRate(items);
  const subtotal = data.subtotal ?? vatGroups.reduce((sum, group) => sum + group.base, 0);
  const totalVat = isReverseVAT ? 0 : vatGroups.reduce((sum, group) => sum + group.amount, 0);
  const total = data.total ?? subtotal + totalVat;
  const vatLines = isReverseVAT
    ? '<dt>Moms (0%)</dt><dd>0,00</dd>'
    : vatGroups
      .map((group) => `<dt>Moms (${group.rate}%)</dt><dd>${formatInvoiceAmount(group.amount)}</dd>`)
      .join('');

  return `
    <tfoot class="invoice-lines__footer">
      ${isReverseVAT ? '<tr><td colspan="6" style="font-style: italic;">Omvänd skattskyldighet för byggtjänster gäller</td></tr>' : ''}
      <tr>
        <td colspan="2" style="vertical-align: bottom; width: 40%;">
          <dl class="invoice-summary">
            <dt>Exkl. moms</dt><dd>${formatInvoiceAmount(subtotal)}</dd>
            ${vatLines}
          </dl>
        </td>
        <td colspan="4" style="vertical-align: bottom; padding: 0; width: 60%;">
          <div class="invoice-total-box">
            <dl>
              <dt>Förfallodatum</dt><dd>${text(data.dueDate)}</dd>
              <dt>OCR</dt><dd>${text(data.ocr || data.invoiceNumber)}</dd>
              <dt class="invoice-total-box__total">Totalbelopp</dt>
              <dd class="invoice-total-box__total">${formatInvoiceAmount(total)}</dd>
            </dl>
          </div>
        </td>
      </tr>
    </tfoot>
  `;
}

function buildLinesTable(
  data: InvoicePdfData,
  items: InvoicePdfItem[],
  showSummary: boolean,
  isReverseVAT: boolean,
): string {
  const noteRow = showSummary && isReverseVAT
    ? '<tr><td colspan="6" style="font-style: italic;">Omvänd skattskyldighet för byggtjänster gäller</td></tr>'
    : '';
  const fillerHeightPx = calculateFillerHeightPx(data, items.length, showSummary, isReverseVAT);
  const fillerRow = fillerHeightPx > 0
    ? `<tr class="invoice-lines__filler" style="height:${fillerHeightPx}px;"><td colspan="6"></td></tr>`
    : '';
  const summaryFooter = showSummary ? buildSummary(data, isReverseVAT) : '';

  return `
    <table class="invoice-lines" style="height:${INVOICE_TABLE_HEIGHT_PX}px;">
      <colgroup>
        <col style="width: 9%;" />
        <col style="width: 39%;" />
        <col style="width: 8%;" />
        <col style="width: 6%;" />
        <col style="width: 18%;" />
        <col style="width: 20%;" />
      </colgroup>
      <thead>
        <tr>
          <th>Art.nr</th>
          <th class="description">Benämning</th>
          <th class="r nowrap quantity">Antal</th>
          <th class="nowrap unit">Enhet</th>
          <th class="r nowrap amount">À-pris</th>
          <th class="r nowrap amount">Summa</th>
        </tr>
      </thead>
      <tbody>
        ${buildItemRows(items)}
        ${noteRow}
        ${fillerRow}
      </tbody>
      ${summaryFooter}
    </table>
  `;
}

function buildInvoicePdfPage(
  data: InvoicePdfData,
  logoDataUrl: string,
  items: InvoicePdfItem[],
  opts: { showSummary: boolean },
): string {
  const isReverseVAT = data.reverseVAT === 'true';

  return `
    <section class="invoice-page">
      <div class="invoice-page__header">${buildHeader(data, logoDataUrl)}</div>
      <div class="invoice-page__body">${buildLinesTable(data, items, opts.showSummary, isReverseVAT)}</div>
      <div class="invoice-page__footer">${buildFooter(data.companyFooter)}</div>
    </section>
  `;
}

function buildFooter(footer: InvoicePdfCompanyFooter = {}): string {
  return `
    <table class="invoice-footer">
      <tr>
        <td><b>Adress</b><br>${text(footer.name)}<br>${text(footer.address)}<br>${text(footer.city)}</td>
        <td><b>Telefon</b><br>${text(footer.phone)}<br><b>E-post</b><br>${text(footer.email)}</td>
        <td><b>Webbplats</b><br>${text(footer.website)}<br><b>Organisationsnr</b><br>${text(footer.orgNumber)}</td>
        <td><b>Momsreg.nr</b><br>${text(footer.vatNumber)}<br>${text(footer.vatStatus)}</td>
      </tr>
    </table>
  `;
}

export function buildInvoicePdfHtmlPuppeteer(data: InvoicePdfData, logoDataUrl = ''): string {
  const pages = paginateInvoiceItemsByCount(data);
  const pagesHtml = pages
    .map((page) => buildInvoicePdfPage(data, logoDataUrl, page.items, {
      showSummary: page.showSummary,
    }))
    .join('');

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <title>Faktura ${text(data.invoiceNumber)}</title>
  <style>${INVOICE_PDF_CSS}</style>
</head>
<body>
  <main class="invoice-document">${pagesHtml}</main>
</body>
</html>`;
}
