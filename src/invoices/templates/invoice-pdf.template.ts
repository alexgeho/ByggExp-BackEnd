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
  // Optional bank details shown on the summary band (reference layout). Rendered
  // only when present — most companies bill via Bankgiro/Plusgiro alone.
  iban?: string;
  bic?: string;
  country?: string;
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
  // Currency code shown in front of the amount due (e.g. "SEK 1 770,00").
  currency?: string;
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

// Layout mirrors a standard Swedish invoice (Fortnox/Qurant style): logo top-left,
// title + invoice meta + recipient top-right, a borderless line table with only
// horizontal rules, and a bottom band of Exkl. moms / Moms / Totalt / ATT BETALA
// above a four-column company footer.
const INVOICE_PDF_CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: Helvetica, Arial, sans-serif;
  font-size: 13px;
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

/* ---- Header: logo (left) | title + recipient (middle) | Sida + meta (right) ---- */
.invoice-header__top {
  display: grid;
  grid-template-columns: 1.1fr 1fr 1fr;
  gap: 20px;
  align-items: start;
}
.invoice-header__logo img { max-height: 130px; max-width: 100%; object-fit: contain; display: block; }
.invoice-header__sida { text-align: right; font-size: 12px; color: #333; margin-bottom: 8px; }
.invoice-header__title { font-size: 30px; font-weight: bold; margin: 0 0 18px; }
.invoice-header__recipient { font-weight: bold; font-size: 14px; line-height: 1.5; margin-top: 0; }
.invoice-header__meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 24px;
  row-gap: 3px;
  font-size: 13px;
  margin: 0;
  align-content: start;
}
.invoice-header__meta dt { margin: 0; }
.invoice-header__meta dd { margin: 0; white-space: nowrap; }

/* ---- Detail row: customer refs (left) | our refs (right), top-aligned ---- */
.invoice-header__details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 48px;
  align-items: start;
  margin: 30px 0 14px;
}
.invoice-header__details dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 18px;
  row-gap: 3px;
  font-size: 13px;
  margin: 0;
  align-content: start;
}
.invoice-header__details dt { margin: 0; }
.invoice-header__details dd { margin: 0; white-space: nowrap; }

/* ---- Line items: borderless, horizontal rules only ---- */
.invoice-lines {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  align-self: stretch;
}
.invoice-lines thead th {
  text-align: left;
  font-weight: normal;
  padding: 8px 10px 9px;
  border-top: 1px solid #d5dae1;
  border-bottom: 1px solid #d5dae1;
  font-size: 13px;
  vertical-align: bottom;
}
.invoice-lines tbody td {
  padding: 14px 10px 0;
  font-size: 13px;
  vertical-align: top;
}
.invoice-lines__filler td { padding: 0; line-height: 0; border: none; }
.invoice-lines__footer td { vertical-align: bottom; border: none; padding: 0; }
.description { text-align: left; white-space: normal; word-break: break-word; }
.nowrap, .quantity, .unit, .amount { white-space: nowrap; }
.amount { font-variant-numeric: tabular-nums; }
.r { text-align: right; }
.reverse-note { font-size: 13px; padding: 12px 10px 0; }

/* ---- Summary band: note + rules + Exkl./Moms/Totalt/ATT BETALA ---- */
.invoice-summary-cell { padding: 0; }
.invoice-summary { width: 100%; }
.invoice-summary__note { font-size: 13px; padding: 0 10px 8px; line-height: 1.5; }
.invoice-summary__totals {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid #d5dae1;
  padding: 8px 10px 10px;
  column-gap: 12px;
}
.invoice-summary__totals .lbl { font-size: 13px; font-weight: bold; padding-bottom: 2px; }
.invoice-summary__totals .val { font-size: 14px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.invoice-summary__totals .att-lbl { text-align: right; }
.invoice-summary__totals .att-val { text-align: right; font-size: 18px; font-weight: bold; }
.invoice-summary__vat {
  display: grid;
  grid-template-columns: 1fr auto;
  border-top: 1px solid #d5dae1;
  padding: 8px 10px 0;
  font-size: 13px;
  column-gap: 16px;
}
.invoice-summary__vat .bank b { font-weight: bold; }

/* ---- Footer ---- */
.invoice-footer {
  width: 100%;
  margin-top: 16px;
  display: grid;
  grid-template-columns: 1.2fr 1.1fr 0.8fr 1.1fr;
  gap: 16px;
  font-size: 12px;
  line-height: 1.5;
}
.invoice-footer b { display: block; }
.invoice-footer .gap { display: block; margin-top: 6px; }
`;

export function formatInvoiceAmount(value: number): string {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function text(value?: string | number | null): string {
  if (value === null || value === undefined) {
    return "";
  }
  return escapeHtml(String(value));
}

function multilineText(value?: string): string {
  return text(value).replaceAll("\n", "<br>");
}

// Payment terms as "{n} dagar", derived from invoice date → due date. Returns ''
// when either date is missing or unparseable (row is then omitted).
function paymentTermsDays(date?: string, dueDate?: string): string {
  if (!date || !dueDate) return "";
  const start = Date.parse(date);
  const end = Date.parse(dueDate);
  if (Number.isNaN(start) || Number.isNaN(end)) return "";
  const days = Math.round((end - start) / 86400000);
  if (days <= 0) return "";
  return `${days} dagar`;
}

function groupVatByRate(items: InvoicePdfItem[]): VatGroup[] {
  const map = new Map<number, { base: number; amount: number }>();

  for (const item of items) {
    if (item.isText) continue;
    const price = typeof item.price === "number" ? item.price : 0;
    const discount = typeof item.discount === "number" ? item.discount : 0;
    const quantity = typeof item.quantity === "number" ? item.quantity : 0;
    const rate = typeof item.vatRate === "number" ? item.vatRate : 25;
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
  const logo = logoDataUrl ? `<img src="${logoDataUrl}" alt="" />` : "";
  const dateLabel = data.creditOfNumber ? "Kreditfakturadatum" : "Fakturadatum";
  const terms = paymentTermsDays(data.date, data.dueDate);

  return `
    <header class="invoice-header">
      <!-- Top band: logo (left) | title + recipient (middle) | Sida + meta (right) -->
      <div class="invoice-header__top">
        <div class="invoice-header__logo">${logo}</div>
        <div>
          <div class="invoice-header__title">${data.creditOfNumber ? "Kreditfaktura" : "Faktura"}</div>
          <div class="invoice-header__recipient">
            ${text(data.companyName) || "&nbsp;"}<br>
            ${text(data.address) || "&nbsp;"}<br>
            ${text(data.postalCode) || "&nbsp;"}
          </div>
        </div>
        <div>
          <div class="invoice-header__sida">Sida ${pageIndex + 1}(${pageCount})</div>
          <dl class="invoice-header__meta">
            <dt>${dateLabel}</dt><dd>${text(data.date) || "&nbsp;"}</dd>
            <dt>Fakturanr</dt><dd>${text(data.invoiceNumber) || "&nbsp;"}</dd>
            ${data.creditOfNumber ? `<dt>Avser faktura</dt><dd>${text(data.creditOfNumber)}</dd>` : ""}
            <dt>OCR</dt><dd>${text(data.ocr || data.invoiceNumber) || "&nbsp;"}</dd>
          </dl>
        </div>
      </div>
      <!-- Detail row: customer refs | our refs, top-aligned -->
      <div class="invoice-header__details">
        <dl>
          <dt>Kundnr</dt><dd>${text(data.customerNumber) || "&nbsp;"}</dd>
          <dt>Er referens</dt><dd>${text(data.yourReference) || "&nbsp;"}</dd>
          ${data.orderReference ? `<dt>Er orderreferens</dt><dd>${text(data.orderReference)}</dd>` : ""}
        </dl>
        <dl>
          <dt>Vår referens</dt><dd>${text(data.ourReference) || "&nbsp;"}</dd>
          ${terms ? `<dt>Betalningsvillkor</dt><dd>${text(terms)}</dd>` : ""}
          <dt>Förfallodatum</dt><dd class="nowrap">${text(data.dueDate) || "&nbsp;"}</dd>
          ${data.lateInterest ? `<dt>Dröjsmålsränta</dt><dd>${text(data.lateInterest)}</dd>` : ""}
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
      // Text-only row: heading/note spanning the description, no numbers.
      if (item.isText) {
        return `
        <tr class="invoice-lines__item invoice-lines__text">
          <td></td>
          <td class="description" colspan="5">${multilineText(item.description)}</td>
        </tr>
      `;
      }

      const price = typeof item.price === "number" ? item.price : 0;
      const discount = typeof item.discount === "number" ? item.discount : 0;
      const quantity = typeof item.quantity === "number" ? item.quantity : 0;
      const total = quantity * price * (1 - discount / 100);

      return `
        <tr class="invoice-lines__item">
          <td class="nowrap">${text(item.articleNumber)}</td>
          <td class="description">${multilineText(item.description)}</td>
          <td class="r nowrap quantity">${formatInvoiceAmount(quantity)}</td>
          <td class="nowrap unit">${text(item.unit || "st")}</td>
          <td class="r nowrap amount">${formatInvoiceAmount(price)}</td>
          <td class="r nowrap amount">${formatInvoiceAmount(total)}</td>
        </tr>
      `;
    })
    .join("");
}

const MM_TO_PX = 96 / 25.4;
const A4_PAGE_HEIGHT_PX = Math.floor(297 * MM_TO_PX);
const BODY_FONT_SIZE_PX = 13;
const BODY_LINE_HEIGHT = 1.4;
const BODY_LINE_HEIGHT_PX = BODY_FONT_SIZE_PX * BODY_LINE_HEIGHT;
const TABLE_CELL_VERTICAL_PADDING_PX = 22;
const TABLE_ROW_HEIGHT_PX = Math.ceil(
  BODY_LINE_HEIGHT_PX + TABLE_CELL_VERTICAL_PADDING_PX,
);
// Header row uses 8+9 padding and two 1px rules.
const TABLE_HEADER_HEIGHT_PX = Math.ceil(BODY_LINE_HEIGHT_PX + 17 + 2);
const REVERSE_VAT_NOTICE_HEIGHT_PX = Math.ceil(BODY_LINE_HEIGHT_PX + 12);

// Header block: logo top band + bottom detail row, fixed min-height so the detail
// blocks pin near the base of the header (mirrors the reference).
const HEADER_PAGE_TOP_PADDING_PX = Math.ceil(14 * MM_TO_PX);
const HEADER_TOP_BAND_PX = 170; // logo | title + recipient | meta (side by side)
const HEADER_DETAILS_GAP_PX = 30; // margin above the detail row
const HEADER_DETAILS_ROWS = 4;
const HEADER_BOTTOM_MARGIN_PX = 14;
const INVOICE_HEADER_HEIGHT_PX = Math.ceil(
  HEADER_PAGE_TOP_PADDING_PX +
    HEADER_TOP_BAND_PX +
    HEADER_DETAILS_GAP_PX +
    HEADER_DETAILS_ROWS * (BODY_LINE_HEIGHT_PX + 3) +
    HEADER_BOTTOM_MARGIN_PX,
);

// Footer: top border/margin + up to 4 text lines (Adress column) + bottom padding.
const FOOTER_LINE_COUNT = 4;
const FOOTER_MARGIN_TOP_PX = 16;
const FOOTER_TOP_PADDING_PX = 10;
const FOOTER_BOTTOM_PADDING_PX = Math.ceil(8 * MM_TO_PX);
const INVOICE_FOOTER_HEIGHT_PX = Math.ceil(
  FOOTER_MARGIN_TOP_PX +
    FOOTER_TOP_PADDING_PX +
    FOOTER_BOTTOM_PADDING_PX +
    FOOTER_LINE_COUNT * BODY_LINE_HEIGHT_PX,
);

const INVOICE_TABLE_HEIGHT_PX = Math.max(
  TABLE_ROW_HEIGHT_PX,
  A4_PAGE_HEIGHT_PX - INVOICE_HEADER_HEIGHT_PX - INVOICE_FOOTER_HEIGHT_PX,
);

function calculateSummaryHeightPx(
  data: InvoicePdfData,
  isReverseVAT: boolean,
): number {
  // Note line (optional) + totals band (2 rows ~ 44px) + VAT/bank line (~24px).
  const rounding = Number(data.rounding) || 0;
  const rotDeduction = Number(data.rotDeduction) || 0;
  const noteLines = (isReverseVAT ? 1 : 0) + (data.rotEnabled ? 1 : 0);
  const noteHeight = noteLines ? noteLines * BODY_LINE_HEIGHT_PX + 8 : 0;
  const totalsBand = 44 + (rounding || rotDeduction ? 0 : 0);
  const vatLine = 24;
  return Math.ceil(noteHeight + totalsBand + vatLine + 8);
}

function calculateReservedTableHeightPx(
  data: InvoicePdfData,
  showSummary: boolean,
  isReverseVAT: boolean,
): number {
  return (
    TABLE_HEADER_HEIGHT_PX +
    (showSummary && isReverseVAT ? REVERSE_VAT_NOTICE_HEIGHT_PX : 0) +
    (showSummary ? calculateSummaryHeightPx(data, isReverseVAT) : 0)
  );
}

function calculateItemsCapacity(
  data: InvoicePdfData,
  showSummary: boolean,
  isReverseVAT: boolean,
): number {
  const reservedHeight = calculateReservedTableHeightPx(
    data,
    showSummary,
    isReverseVAT,
  );
  return Math.floor(
    Math.max(0, INVOICE_TABLE_HEIGHT_PX - reservedHeight) / TABLE_ROW_HEIGHT_PX,
  );
}

function calculateFillerHeightPx(
  data: InvoicePdfData,
  itemCount: number,
  showSummary: boolean,
  isReverseVAT: boolean,
): number {
  const reservedHeight = calculateReservedTableHeightPx(
    data,
    showSummary,
    isReverseVAT,
  );
  return Math.max(
    0,
    INVOICE_TABLE_HEIGHT_PX - reservedHeight - itemCount * TABLE_ROW_HEIGHT_PX,
  );
}

function paginateInvoiceItemsByCount(data: InvoicePdfData): Array<{
  items: InvoicePdfItem[];
  showSummary: boolean;
}> {
  const items = data.items || [];
  const isReverseVAT = data.reverseVAT === "true";
  const fullPageCapacity = Math.max(
    1,
    calculateItemsCapacity(data, false, isReverseVAT),
  );
  const lastPageCapacity = Math.max(
    1,
    calculateItemsCapacity(data, true, isReverseVAT),
  );

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
  const subtotal =
    data.subtotal ?? vatGroups.reduce((sum, group) => sum + group.base, 0);
  const totalVat = isReverseVAT
    ? 0
    : vatGroups.reduce((sum, group) => sum + group.amount, 0);
  const total = data.total ?? subtotal + totalVat;
  const rotDeduction = Number(data.rotDeduction) || 0;
  const roundedTotal = data.roundedTotal ?? Math.round(total - rotDeduction);
  const currency = data.currency || "SEK";
  const footer = data.companyFooter || {};

  // Per-rate VAT breakdown line, e.g. "Moms 25% 345,00 (1 380,00)".
  const vatBreakdown = isReverseVAT
    ? "Omvänd skattskyldighet"
    : vatGroups
        .map(
          (group) =>
            `Moms ${group.rate}% ${formatInvoiceAmount(group.amount)} (${formatInvoiceAmount(group.base)})`,
        )
        .join("&nbsp;&nbsp;");

  const bankLine = footer.iban
    ? `<span class="bank"><b>IBAN</b> ${text(footer.iban)}${footer.bic ? `&nbsp;&nbsp;<b>BIC</b> ${text(footer.bic)}` : ""}</span>`
    : "<span></span>";

  // Optional note lines (reverse VAT / ROT) sit above the totals band.
  const notes: string[] = [];
  if (isReverseVAT) {
    notes.push("Omvänd skattskyldighet för byggtjänster gäller");
  }
  if (data.rotEnabled) {
    notes.push(
      `ROT-avdrag: personnr ${text(data.rotPersonalNumber) || "—"}${data.rotProperty ? `, fastighet ${text(data.rotProperty)}` : ""}`,
    );
  }
  const noteHtml = notes.length
    ? `<div class="invoice-summary__note" style="font-style: italic;">${notes.join("<br>")}</div>`
    : "";

  return `
    <tfoot class="invoice-lines__footer">
      <tr>
        <td colspan="6" class="invoice-summary-cell">
          <div class="invoice-summary">
            ${noteHtml}
            <div class="invoice-summary__totals">
              <div>
                <div class="lbl">Exkl. moms</div>
                <div class="val">${formatInvoiceAmount(subtotal)}</div>
              </div>
              <div>
                <div class="lbl">Moms</div>
                <div class="val">${formatInvoiceAmount(totalVat)}</div>
              </div>
              <div>
                <div class="lbl">Totalt</div>
                <div class="val">${formatInvoiceAmount(total)}</div>
              </div>
              <div>
                <div class="lbl att-lbl">ATT BETALA</div>
                <div class="val att-val">${text(currency)} ${formatInvoiceAmount(roundedTotal)}</div>
              </div>
            </div>
            <div class="invoice-summary__vat">
              <span>${vatBreakdown}</span>
              ${bankLine}
            </div>
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
  const fillerHeightPx = calculateFillerHeightPx(
    data,
    items.length,
    showSummary,
    isReverseVAT,
  );
  const fillerRow =
    fillerHeightPx > 0
      ? `<tr class="invoice-lines__filler" style="height:${fillerHeightPx}px;"><td colspan="6"></td></tr>`
      : "";
  const summaryFooter = showSummary ? buildSummary(data, isReverseVAT) : "";

  return `
    <table class="invoice-lines" style="height:${INVOICE_TABLE_HEIGHT_PX}px;">
      <colgroup>
        <col style="width: 9%;" />
        <col style="width: 39%;" />
        <col style="width: 14%;" />
        <col style="width: 10%;" />
        <col style="width: 13%;" />
        <col style="width: 15%;" />
      </colgroup>
      <thead>
        <tr>
          <th class="nowrap">Art.nr</th>
          <th class="description">Benämning</th>
          <th class="r nowrap quantity">Lev ant</th>
          <th class="nowrap unit">Enhet</th>
          <th class="r nowrap amount">À-pris</th>
          <th class="r nowrap amount">Summa</th>
        </tr>
      </thead>
      <tbody>
        ${buildItemRows(items)}
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
  const isReverseVAT = data.reverseVAT === "true";

  return `
    <section class="invoice-page">
      <div class="invoice-page__header">${buildHeader(data, logoDataUrl, opts.pageIndex, opts.pageCount)}</div>
      <div class="invoice-page__body">${buildLinesTable(data, items, opts.showSummary, isReverseVAT)}</div>
      <div class="invoice-page__footer">${buildFooter(data.companyFooter)}</div>
    </section>
  `;
}

function buildFooter(footer: InvoicePdfCompanyFooter = {}): string {
  const country = footer.country || "Sverige";
  const giroLabel = footer.bankgiro
    ? "Bankgiro"
    : footer.plusgiro
      ? "Plusgiro"
      : "Bankgiro";
  const giroValue = footer.bankgiro || footer.plusgiro || "";

  return `
    <div class="invoice-footer">
      <div>
        <b>Adress</b>
        ${text(footer.name)}<br>${text(footer.address)}<br>${text(footer.city)}<br>${text(country)}
      </div>
      <div>
        <b>Telefon</b>${text(footer.phone)}
        <b class="gap">E-post</b>${text(footer.email)}
        <b class="gap">Webbadress</b>${text(footer.website)}
      </div>
      <div>
        <b>${giroLabel}</b>${text(giroValue)}
      </div>
      <div>
        <b>Organisationsnr</b>${text(footer.orgNumber)}
        <b class="gap">Momsreg. nr</b>${text(footer.vatNumber)}
        ${footer.vatStatus ? `<span class="gap">${text(footer.vatStatus)}</span>` : ""}
      </div>
    </div>
  `;
}

export function buildInvoicePdfHtmlPuppeteer(
  data: InvoicePdfData,
  logoDataUrl = "",
): string {
  // Text-only rows always render under the priced rows, regardless of the order
  // they were entered in (stable partition: priced first, then text).
  const items = data.items || [];
  if (items.some((it) => it.isText)) {
    const ordered = [
      ...items.filter((it) => !it.isText),
      ...items.filter((it) => it.isText),
    ];
    data = { ...data, items: ordered };
  }
  const pages = paginateInvoiceItemsByCount(data);
  const pageCount = pages.length;
  const pagesHtml = pages
    .map((page, pageIndex) =>
      buildInvoicePdfPage(data, logoDataUrl, page.items, {
        showSummary: page.showSummary,
        pageIndex,
        pageCount,
      }),
    )
    .join("");

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
