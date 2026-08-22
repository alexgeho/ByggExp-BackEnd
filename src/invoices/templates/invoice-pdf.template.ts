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
  bankgiro?: string;
  plusgiro?: string;
};

export type InvoicePdfItem = {
  articleNumber?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  price?: number;
  discount?: number;
  vatRate?: number;
  // Text-only row (heading / note) — rendered under the priced rows spanning the
  // description, with no numbers, and excluded from the totals.
  isText?: boolean;
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
  rotEnabled?: boolean;
  rotPersonalNumber?: string;
  rotProperty?: string;
  rotDeduction?: number;
  rounding?: number;
  roundedTotal?: number;
  creditOfNumber?: number | null;
  dueDate?: string;
  ocr?: string;
  companyFooter?: InvoicePdfCompanyFooter;
  // Data URL of the pre-rendered payment QR code (Swedish BGC format). When
  // absent (e.g. no Bankgiro configured) the QR slot is simply omitted.
  qrDataUrl?: string;
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
  font-size: 14px;
  line-height: 1.4;
  color: #1b1b1b;
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
.invoice-page__header { padding: 14mm 16mm 0; }
.invoice-page__body { flex: 1; padding: 0 16mm; display: flex; flex-direction: column; }
.invoice-page__footer { padding: 0 16mm 8mm; }

/* ---- Header: 3 columns, each with a top block and a bottom detail block ---- */
.invoice-header {
  display: grid;
  grid-template-columns: 1.15fr 1fr 0.95fr;
  gap: 20px;
  min-height: 255px;
  margin-bottom: 18px;
}
.invoice-header__col {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.invoice-header__logo img { max-height: 150px; max-width: 100%; object-fit: contain; display: block; }
.invoice-header__sida { text-align: right; font-size: 13px; color: #333; margin-bottom: 14px; }
.invoice-header__title { font-size: 32px; font-weight: bold; margin: 0 0 14px; }
.invoice-header__recipient { font-weight: bold; font-size: 15px; line-height: 1.5; }
.invoice-header dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 18px;
  row-gap: 3px;
  font-size: 14px;
  margin: 0;
  align-content: start;
}
.invoice-header dt { margin: 0; }
.invoice-header dd { margin: 0; }

/* ---- Line items: light table, no outer box ---- */
.invoice-lines {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  align-self: stretch;
  border: 1px solid #333;
}
.invoice-lines thead th {
  text-align: left;
  font-weight: bold;
  padding: 6px 10px 8px;
  border-bottom: 1px solid #333;
  font-size: 14px;
  vertical-align: bottom;
}
.invoice-lines tbody td {
  padding: 7px 10px 0;
  font-size: 14px;
  vertical-align: top;
}
.invoice-lines__filler td { padding: 0; line-height: 0; border: none; }
.invoice-lines__footer td { vertical-align: bottom; border: none; padding: 0; }
.description { text-align: left; white-space: normal; word-break: break-word; }
.nowrap, .quantity, .unit, .amount { white-space: nowrap; }
.amount { font-variant-numeric: tabular-nums; }
.r { text-align: right; }
.reverse-note { font-size: 14px; padding: 12px 10px 0; }

/* ---- Summary: totals (left) + gray payment box with QR (right) ---- */
.invoice-summary-cell { padding: 0; }
.invoice-summary-grid {
  display: grid;
  grid-template-columns: 2fr 3fr;
  align-items: stretch;
}
.invoice-summary-left {
  display: flex;
  align-items: flex-end;
  padding: 0 10px 6px;
}
.invoice-totals { border-collapse: collapse; font-size: 15px; width: 100%; border-top: 1px solid #333; }
.invoice-totals td { padding: 4px 0 0; }
.invoice-totals td.k { font-weight: bold; padding-right: 40px; white-space: nowrap; }
.invoice-totals td.v { text-align: right; white-space: nowrap; }

.invoice-paybox {
  background: #efefef;
  border-top: 1px solid #333;
  border-left: 1px solid #333;
  padding: 16px 18px;
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 18px;
  align-items: start;
}
.invoice-paybox__qr { width: 110px; height: 110px; display: block; }
.invoice-paybox dl {
  display: grid;
  grid-template-columns: 1fr auto;
  column-gap: 12px;
  row-gap: 6px;
  margin: 0;
  align-content: start;
}
.invoice-paybox dt { font-weight: bold; margin: 0; }
.invoice-paybox dd { margin: 0; text-align: right; white-space: nowrap; }
.invoice-paybox .note { grid-column: 1 / -1; font-style: italic; color: #333; margin: -2px 0 2px; font-size: 13px; }
.invoice-paybox dt.att, .invoice-paybox dd.att { font-size: 20px; font-weight: bold; padding-top: 12px; white-space: nowrap; }
.invoice-paybox--noqr { grid-template-columns: 1fr; }

/* ---- Footer ---- */
.invoice-footer {
  width: 100%;
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  font-size: 13px;
  line-height: 1.5;
}
.invoice-footer b { display: block; }
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
    if (item.isText) continue;
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

function buildHeader(
  data: InvoicePdfData,
  logoDataUrl: string,
  pageIndex: number,
  pageCount: number,
): string {
  const logo = logoDataUrl ? `<img src="${logoDataUrl}" alt="" />` : '';

  return `
    <header class="invoice-header">
      <!-- Column 1: logo (top) + customer-side references (bottom) -->
      <div class="invoice-header__col">
        <div class="invoice-header__logo">${logo}</div>
        <dl>
          <dt>Kundnr</dt><dd>${text(data.customerNumber) || '&nbsp;'}</dd>
          <dt>Er referens</dt><dd>${text(data.yourReference) || '&nbsp;'}</dd>
          <dt>Er orderreferens</dt><dd>${text(data.orderReference) || '&nbsp;'}</dd>
        </dl>
      </div>
      <!-- Column 2: title + recipient (top) + our references (bottom) -->
      <div class="invoice-header__col">
        <div>
          <div class="invoice-header__title">${data.creditOfNumber ? 'Kreditfaktura' : 'Faktura'}</div>
          <div class="invoice-header__recipient">
            ${text(data.companyName) || '&nbsp;'}<br>
            ${text(data.address) || '&nbsp;'}<br>
            ${text(data.postalCode) || '&nbsp;'}
          </div>
        </div>
        <dl>
          <dt>Vår referens</dt><dd>${text(data.ourReference) || '&nbsp;'}</dd>
          <dt>Leveransdatum</dt><dd>${text(data.deliveryDate) || '&nbsp;'}</dd>
          <dt>Förfallodatum</dt><dd>${text(data.dueDate) || '&nbsp;'}</dd>
          ${data.lateInterest ? `<dt>Dröjsmålsränta</dt><dd>${text(data.lateInterest)}</dd>` : ''}
        </dl>
      </div>
      <!-- Column 3: Sida + invoice meta (top) -->
      <div class="invoice-header__col">
        <div>
          <div class="invoice-header__sida">Sida ${pageIndex + 1}(${pageCount})</div>
          <dl>
            <dt>Fakturadatum</dt><dd>${text(data.date) || '&nbsp;'}</dd>
            <dt>Fakturanr</dt><dd>${text(data.invoiceNumber) || '&nbsp;'}</dd>
            ${data.creditOfNumber ? `<dt>Avser faktura</dt><dd>${text(data.creditOfNumber)}</dd>` : ''}
            <dt>OCR</dt><dd>${text(data.ocr || data.invoiceNumber) || '&nbsp;'}</dd>
          </dl>
        </div>
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
      // Text-only row: heading/note spanning the description, no numbers.
      if (item.isText) {
        return `
        <tr class="invoice-lines__item invoice-lines__text">
          <td></td>
          <td class="description" colspan="5">${multilineText(item.description)}</td>
        </tr>
      `;
      }

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
const BODY_FONT_SIZE_PX = 14;
const BODY_LINE_HEIGHT = 1.4;
const BODY_LINE_HEIGHT_PX = BODY_FONT_SIZE_PX * BODY_LINE_HEIGHT;
const TABLE_CELL_VERTICAL_PADDING_PX = 16;
const TABLE_ROW_HEIGHT_PX = Math.ceil(BODY_LINE_HEIGHT_PX + TABLE_CELL_VERTICAL_PADDING_PX);
// Header row uses 4+8 padding and a 1.5px rule.
const TABLE_HEADER_HEIGHT_PX = Math.ceil(BODY_LINE_HEIGHT_PX + 12 + 2);
const REVERSE_VAT_NOTICE_HEIGHT_PX = Math.ceil(BODY_LINE_HEIGHT_PX + 12);

// Header block: 3 columns with top content + bottom details, fixed min-height
// so the bottom detail blocks pin near the base of the header (mirrors the
// reference). Total = page top padding + header min-height + bottom margin.
const HEADER_PAGE_TOP_PADDING_PX = Math.ceil(14 * MM_TO_PX);
const HEADER_BLOCK_MIN_HEIGHT_PX = 255;
const HEADER_BOTTOM_MARGIN_PX = 18;
const INVOICE_HEADER_HEIGHT_PX = Math.ceil(
  HEADER_PAGE_TOP_PADDING_PX + HEADER_BLOCK_MIN_HEIGHT_PX + HEADER_BOTTOM_MARGIN_PX,
);

// Footer: top border/margin + up to 5 text lines (Telefon column) + bottom padding.
const FOOTER_LINE_COUNT = 5;
const FOOTER_MARGIN_TOP_PX = 16;
const FOOTER_TOP_PADDING_PX = 10;
const FOOTER_BOTTOM_PADDING_PX = Math.ceil(8 * MM_TO_PX);
const INVOICE_FOOTER_HEIGHT_PX = Math.ceil(
  FOOTER_MARGIN_TOP_PX
    + FOOTER_TOP_PADDING_PX
    + FOOTER_BOTTOM_PADDING_PX
    + FOOTER_LINE_COUNT * BODY_LINE_HEIGHT_PX,
);

const INVOICE_TABLE_HEIGHT_PX = Math.max(
  TABLE_ROW_HEIGHT_PX,
  A4_PAGE_HEIGHT_PX - INVOICE_HEADER_HEIGHT_PX - INVOICE_FOOTER_HEIGHT_PX,
);

function calculateSummaryHeightPx(data: InvoicePdfData, isReverseVAT: boolean): number {
  const vatGroups = groupVatByRate(data.items || []);
  // Left totals: Exkl. moms + VAT lines + Avrundning.
  const rounding = Number(data.rounding) || 0;
  const leftLineCount =
    1 + (isReverseVAT ? 1 : Math.max(1, vatGroups.length)) + (rounding ? 1 : 0);
  const leftBlockHeight = leftLineCount * (15 * 1.4 + 6);
  // Right payment box: QR (120) vs the text lines, whichever is taller, + padding.
  const rightBlockHeight = 120 + 32;
  return Math.ceil(24 + Math.max(leftBlockHeight, rightBlockHeight));
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

function buildPaymentBox(data: InvoicePdfData, roundedTotal: number): string {
  const qr = data.qrDataUrl
    ? `<img class="invoice-paybox__qr" src="${data.qrDataUrl}" alt="" />`
    : '';
  const footer = data.companyFooter || {};
  const giroLabel = footer.bankgiro ? 'Bankgiro' : footer.plusgiro ? 'Plusgiro' : '';
  const giroValue = footer.bankgiro || footer.plusgiro || '';
  const giroLine = giroValue ? `<dt>${giroLabel}</dt><dd>${text(giroValue)}</dd>` : '';

  return `
    <div class="invoice-paybox${qr ? '' : ' invoice-paybox--noqr'}">
      ${qr}
      <dl>
        <dt>Förfallodatum</dt><dd>${text(data.dueDate)}</dd>
        <dt>OCR</dt><dd>${text(data.ocr || data.invoiceNumber)}</dd>
        <div class="note">Anges vid betalning.</div>
        ${giroLine}
        <dt class="att">Att betala</dt><dd class="att">${formatInvoiceAmount(roundedTotal)}</dd>
      </dl>
    </div>
  `;
}

function buildSummary(data: InvoicePdfData, isReverseVAT: boolean): string {
  const items = data.items || [];
  const vatGroups = groupVatByRate(items);
  const subtotal = data.subtotal ?? vatGroups.reduce((sum, group) => sum + group.base, 0);
  const totalVat = isReverseVAT ? 0 : vatGroups.reduce((sum, group) => sum + group.amount, 0);
  const total = data.total ?? subtotal + totalVat;
  const rotDeduction = Number(data.rotDeduction) || 0;
  const rounding = Number(data.rounding) || 0;
  const roundedTotal = data.roundedTotal ?? Math.round(total - rotDeduction);

  const vatLines = isReverseVAT
    ? '<tr><td class="k">Moms (0 %)</td><td class="v">0,00</td></tr>'
    : vatGroups
      .map(
        (group) =>
          `<tr><td class="k">Moms (${group.rate} %)</td><td class="v">${formatInvoiceAmount(group.amount)}</td></tr>`,
      )
      .join('');

  // ROT and öresavrundning only surface when they actually change the amount due.
  const rotLine = rotDeduction
    ? `<tr><td class="k">ROT-avdrag</td><td class="v">${formatInvoiceAmount(-rotDeduction)}</td></tr>`
    : '';
  const roundingLine = `<tr><td class="k">Avrundning</td><td class="v">${formatInvoiceAmount(rounding)}</td></tr>`;

  return `
    <tfoot class="invoice-lines__footer">
      <tr>
        <td colspan="6" class="invoice-summary-cell">
          <div class="invoice-summary-grid">
            <div class="invoice-summary-left">
              <table class="invoice-totals">
                <tr><td class="k">Exkl. moms</td><td class="v">${formatInvoiceAmount(subtotal)}</td></tr>
                ${vatLines}
                ${rotLine}
                ${roundingLine}
              </table>
            </div>
            ${buildPaymentBox(data, roundedTotal)}
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
  const fillerHeightPx = calculateFillerHeightPx(data, items.length, showSummary, isReverseVAT);
  const fillerRow = fillerHeightPx > 0
    ? `<tr class="invoice-lines__filler" style="height:${fillerHeightPx}px;"><td colspan="6"></td></tr>`
    : '';
  // Reverse-VAT / ROT notices sit directly under the line items (top), matching
  // the reference layout — only on the page that carries the summary.
  const noteRows = showSummary
    ? `${isReverseVAT ? '<tr><td colspan="6" class="reverse-note" style="font-style: italic;">Omvänd skattskyldighet för byggtjänster gäller</td></tr>' : ''}${data.rotEnabled ? `<tr><td colspan="6" class="reverse-note" style="font-style: italic;">ROT-avdrag: personnr ${text(data.rotPersonalNumber) || '—'}${data.rotProperty ? `, fastighet ${text(data.rotProperty)}` : ''}</td></tr>` : ''}`
    : '';
  const summaryFooter = showSummary ? buildSummary(data, isReverseVAT) : '';

  return `
    <table class="invoice-lines" style="height:${INVOICE_TABLE_HEIGHT_PX}px;">
      <colgroup>
        <col style="width: 8%;" />
        <col style="width: 42%;" />
        <col style="width: 12%;" />
        <col style="width: 8%;" />
        <col style="width: 14%;" />
        <col style="width: 16%;" />
      </colgroup>
      <thead>
        <tr>
          <th>Art.nr</th>
          <th class="description">Beskrivning</th>
          <th class="r nowrap quantity">Antal</th>
          <th class="nowrap unit">Enhet</th>
          <th class="r nowrap amount">À-pris</th>
          <th class="r nowrap amount">Summa</th>
        </tr>
      </thead>
      <tbody>
        ${buildItemRows(items)}
        ${noteRows}
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
  opts: { showSummary: boolean; pageIndex: number; pageCount: number },
): string {
  const isReverseVAT = data.reverseVAT === 'true';

  return `
    <section class="invoice-page">
      <div class="invoice-page__header">${buildHeader(data, logoDataUrl, opts.pageIndex, opts.pageCount)}</div>
      <div class="invoice-page__body">${buildLinesTable(data, items, opts.showSummary, isReverseVAT)}</div>
      <div class="invoice-page__footer">${buildFooter(data.companyFooter)}</div>
    </section>
  `;
}

function buildFooter(footer: InvoicePdfCompanyFooter = {}): string {
  return `
    <div class="invoice-footer">
      <div><b>Adress</b>${text(footer.name)}<br>${text(footer.address)}<br>${text(footer.city)}</div>
      <div><b>Telefon</b>${text(footer.phone)}<br><b style="margin-top:8px">E-post/Webbplats</b>${text(footer.email)}<br>${text(footer.website)}</div>
      <div><b>Organisationsnr</b>${text(footer.orgNumber)}<br>${text(footer.vatStatus)}</div>
      <div><b>Momsreg.nr</b>${text(footer.vatNumber)}</div>
    </div>
  `;
}

export function buildInvoicePdfHtmlPuppeteer(data: InvoicePdfData, logoDataUrl = ''): string {
  // Text-only rows always render under the priced rows, regardless of the order
  // they were entered in (stable partition: priced first, then text).
  const items = data.items || [];
  if (items.some((it) => it.isText)) {
    const ordered = [...items.filter((it) => !it.isText), ...items.filter((it) => it.isText)];
    data = { ...data, items: ordered };
  }
  const pages = paginateInvoiceItemsByCount(data);
  const pageCount = pages.length;
  const pagesHtml = pages
    .map((page, pageIndex) => buildInvoicePdfPage(data, logoDataUrl, page.items, {
      showSummary: page.showSummary,
      pageIndex,
      pageCount,
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
