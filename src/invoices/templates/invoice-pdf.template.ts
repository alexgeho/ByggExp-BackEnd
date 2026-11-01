import { deductionMeta } from "../invoice-math";
import {
  formatKontonummer,
  formatNoDate,
  formatNokNumber,
  formatNoOrgNumber,
  isNorway,
} from "../norway";
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
  // Norway only: 11-digit bank account (kontonummer), whether the seller is in
  // Merverdiavgiftsregisteret (org.nr gets the «MVA» suffix) and whether it is
  // registered in Foretaksregisteret (AS/ASA/NUF → the word is printed).
  kontonummer?: string;
  mvaRegistered?: boolean;
  foretaksregisteret?: boolean;
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
  deductionType?: string;
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
  // Seller's home market ("SE" | "NO"). Missing = Sweden (unchanged output).
  country?: string;
  // Norway: KID payment reference (empty when the company uses none).
  kid?: string;
  // Norway: leveringssted (already resolved: invoice → project → buyer).
  deliveryPlace?: string;
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

/* ---- Header, measured off the invoice Geal sends today (Faktura 65):
   logo on the left half; the right column holds "Faktura", the meta pairs
   (indented) and the recipient, all on one left edge; "Sida" in the corner.
   The detail row below uses the same two columns, so "Vår referens" lines up
   under "Faktura". ---- */
.invoice-header__top {
  position: relative;
  display: grid;
  grid-template-columns: 373px 1fr;
  align-items: start;
}
.invoice-header__logo img { max-height: 120px; max-width: 290px; object-fit: contain; display: block; }
.invoice-header__sida { position: absolute; top: -10px; right: 0; font-size: 12px; color: #333; }
.invoice-header__title { font-size: 24px; font-weight: bold; margin: 12px 0 8px; }
.invoice-header__meta {
  display: grid;
  grid-template-columns: minmax(82px, max-content) max-content;
  column-gap: 10px;
  row-gap: 0;
  font-size: 13px;
  line-height: 1.3;
  margin: 0 0 16px 138px;
}
.invoice-header__meta dt { margin: 0; }
.invoice-header__meta dd { margin: 0; white-space: nowrap; }
.invoice-header__recipient { font-weight: normal; font-size: 13px; line-height: 1.3; }

.invoice-header__details {
  display: grid;
  grid-template-columns: 373px 1fr;
  align-items: start;
  margin: 80px 0 14px;
}
.invoice-header__details dl {
  display: grid;
  grid-template-columns: minmax(96px, max-content) max-content;
  column-gap: 10px;
  row-gap: 0;
  line-height: 1.3;
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
.invoice-summary__totals .att-val { text-align: right; font-size: 15px; font-weight: bold; }
.invoice-summary__vat {
  display: grid;
  grid-template-columns: 1fr auto;
  border-top: 1px solid #d5dae1;
  padding: 8px 10px 0;
  font-size: 13px;
  column-gap: 16px;
}
.invoice-summary__vat .bank b { font-weight: bold; }
/* Payment QR sits to the left of the totals band, bottom-aligned with it. */
.invoice-summary__body { display: flex; align-items: flex-end; gap: 22px; }
.invoice-summary__main { flex: 1; }
.invoice-summary__qr { flex: 0 0 auto; text-align: center; padding: 0 0 2px 10px; }
.invoice-summary__qr img { width: 96px; height: 96px; display: block; }
.invoice-summary__qr span { display: block; font-size: 10.5px; color: #64748b; margin-top: 3px; }

/* ---- Footer ---- */
.invoice-footer {
  width: 100%;
  margin-top: 16px;
  display: flex;
  justify-content: space-between;
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

// Every printed word and number format, per seller country. The Swedish set is
// the original wording, kept byte-identical (see se-pdf-snapshot.spec.ts).
type InvoiceLocale = {
  no: boolean;
  lang: string;
  amount: (value: number) => string;
  date: (value?: string) => string;
  unit: (value?: string) => string;
  detailsRows: number;
  invoice: string;
  creditNote: string;
  invoiceDate: string;
  creditDate: string;
  invoiceNo: string;
  creditOf: string;
  page: string;
  customerNo: string;
  yourRef: string;
  yourOrder: string;
  yourVat: string;
  ourRef: string;
  terms: string;
  days: string;
  dueDate: string;
  lateInterest: string;
  colArt: string;
  colDesc: string;
  colQty: string;
  colUnit: string;
  colPrice: string;
  colSum: string;
  exVat: string;
  vat: string;
  total: string;
  toPay: string;
  vatLine: string;
  address: string;
  phone: string;
  email: string;
  web: string;
  orgNo: string;
  vatNo: string;
  defaultCountry: string;
};

const SV_LOCALE: InvoiceLocale = {
  no: false,
  lang: "sv",
  amount: (value) => formatInvoiceAmount(value),
  date: (value) => value ?? "",
  unit: (value) => value || "st",
  detailsRows: 4,
  invoice: "Faktura",
  creditNote: "Kreditfaktura",
  invoiceDate: "Fakturadatum",
  creditDate: "Kreditfakturadatum",
  invoiceNo: "Fakturanr",
  creditOf: "Avser faktura",
  page: "Sida",
  customerNo: "Kundnr",
  yourRef: "Er referens",
  yourOrder: "Ert ordernr",
  yourVat: "Ert VAT-nummer",
  ourRef: "Vår referens",
  terms: "Betalningsvillkor",
  days: "dagar",
  dueDate: "Förfallodatum",
  lateInterest: "Dröjsmålsränta",
  colArt: "Art.nr",
  colDesc: "Benämning",
  colQty: "Lev ant",
  colUnit: "Enhet",
  colPrice: "À-pris",
  colSum: "Summa",
  exVat: "Exkl. moms",
  vat: "Moms",
  total: "Totalt",
  toPay: "ATT BETALA",
  vatLine: "Moms",
  address: "Adress",
  phone: "Telefon",
  email: "E-post",
  web: "Webbadress",
  orgNo: "Organisationsnr",
  vatNo: "Momsreg. nr",
  defaultCountry: "Sverige",
};

// Norwegian bokmål. Required content per bokføringsforskriften kap. 5-1
// (https://lovdata.no/forskrift/2004-12-01-1558): § 5-1-1 nr. 1 number + date,
// nr. 2 the parties (§ 5-1-2: seller name + org.nr, «MVA» suffix when
// VAT-registered, «Foretaksregisteret» for AS/ASA/NUF; buyer name + address),
// nr. 3 what was delivered (description/quantity), nr. 4 delivery date
// (§ 5-1-4), nr. 5 price and due date, nr. 6 VAT in NOK — per rate, summed
// separately (§ 5-1-5). Reverse charge (nr. 7) is not supported for NO.
const NB_LOCALE: InvoiceLocale = {
  no: true,
  lang: "nb",
  amount: (value) => formatNokNumber(value),
  date: (value) => formatNoDate(value),
  unit: (value) => (!value || value === "st" ? "stk" : value),
  detailsRows: 6,
  invoice: "Faktura",
  creditNote: "Kreditnota",
  invoiceDate: "Fakturadato",
  creditDate: "Kreditnotadato",
  invoiceNo: "Fakturanr.",
  creditOf: "Gjelder faktura",
  page: "Side",
  customerNo: "Kundenr.",
  yourRef: "Deres ref.",
  yourOrder: "Deres ordrenr.",
  yourVat: "Deres org.nr.",
  ourRef: "Vår ref.",
  terms: "Betalingsbetingelser",
  days: "dager",
  dueDate: "Forfallsdato",
  lateInterest: "Forsinkelsesrente",
  colArt: "Art.nr.",
  colDesc: "Beskrivelse",
  colQty: "Antall",
  colUnit: "Enhet",
  colPrice: "Enhetspris",
  colSum: "Beløp",
  exVat: "Sum eks. mva",
  vat: "Mva",
  total: "Totalt",
  toPay: "Å BETALE",
  vatLine: "Mva",
  address: "Adresse",
  phone: "Telefon",
  email: "E-post",
  web: "Nettside",
  orgNo: "Org.nr.",
  vatNo: "",
  defaultCountry: "Norge",
};

function localeFor(data: InvoicePdfData): InvoiceLocale {
  return isNorway(data.country) ? NB_LOCALE : SV_LOCALE;
}

// Payment terms as "{n} dagar", derived from invoice date → due date. Returns ''
// when either date is missing or unparseable (row is then omitted).
function paymentTermsDays(
  date?: string,
  dueDate?: string,
  daysWord = "dagar",
): string {
  if (!date || !dueDate) return "";
  const start = Date.parse(date);
  const end = Date.parse(dueDate);
  if (Number.isNaN(start) || Number.isNaN(end)) return "";
  const days = Math.round((end - start) / 86400000);
  if (days <= 0) return "";
  return `${days} ${daysWord}`;
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
  const L = localeFor(data);
  const logo = logoDataUrl ? `<img src="${logoDataUrl}" alt="" />` : "";
  const dateLabel = data.creditOfNumber ? L.creditDate : L.invoiceDate;
  const terms = paymentTermsDays(data.date, data.dueDate, L.days);
  // Sweden always prints an OCR row (falls back to the invoice number). Norway
  // prints KID only when the company uses one, plus the delivery date
  // (bokføringsforskriften § 5-1-1 nr. 4).
  const paymentRefRow = L.no
    ? data.kid && !data.creditOfNumber
      ? `<dt>KID</dt><dd>${text(data.kid)}</dd>`
      : ""
    : `<dt>OCR</dt><dd>${text(data.ocr || data.invoiceNumber) || "&nbsp;"}</dd>`;
  const deliveryRow = L.no
    ? (data.deliveryDate
        ? `<dt>Leveringsdato</dt><dd class="nowrap">${text(L.date(data.deliveryDate))}</dd>`
        : "") +
      (data.deliveryPlace
        ? `<dt>Leveringssted</dt><dd style="white-space:normal">${text(data.deliveryPlace)}</dd>`
        : "")
    : "";

  return `
    <header class="invoice-header">
      <!-- Top band: logo (left half) | title, meta, recipient (right column) -->
      <div class="invoice-header__top">
        <div class="invoice-header__logo">${logo}</div>
        <div>
          <div class="invoice-header__title">${data.creditOfNumber ? L.creditNote : L.invoice}</div>
          <dl class="invoice-header__meta">
            <dt>${dateLabel}</dt><dd>${text(L.date(data.date)) || "&nbsp;"}</dd>
            <dt>${L.invoiceNo}</dt><dd>${text(data.invoiceNumber) || "&nbsp;"}</dd>
            ${data.creditOfNumber ? `<dt>${L.creditOf}</dt><dd>${text(data.creditOfNumber)}</dd>` : ""}
            ${paymentRefRow}
          </dl>
          <div class="invoice-header__recipient">
            ${text(data.companyName) || "&nbsp;"}<br>
            ${text(data.address) || "&nbsp;"}<br>
            ${text(data.postalCode) || "&nbsp;"}
          </div>
        </div>
        <div class="invoice-header__sida">${L.page} ${pageIndex + 1}(${pageCount})</div>
      </div>
      <!-- Detail row: customer refs | our refs, top-aligned -->
      <div class="invoice-header__details">
        <dl>
          <!-- As on the invoices Geal sends today: customer no, their order no,
               and the customer's VAT number (Maria, 2026-09-23). -->
          <dt>${L.customerNo}</dt><dd>${text(data.customerNumber) || "&nbsp;"}</dd>
          ${data.yourReference ? `<dt>${L.yourRef}</dt><dd>${text(data.yourReference)}</dd>` : ""}
          ${data.orderReference ? `<dt>${L.yourOrder}</dt><dd>${text(data.orderReference)}</dd>` : ""}
          ${data.vatNumber ? `<dt>${L.yourVat}</dt><dd>${text(data.vatNumber)}</dd>` : ""}
        </dl>
        <dl>
          <dt>${L.ourRef}</dt><dd>${text(data.ourReference) || "&nbsp;"}</dd>
          ${terms ? `<dt>${L.terms}</dt><dd>${text(terms)}</dd>` : ""}
          <dt>${L.dueDate}</dt><dd class="nowrap">${text(L.date(data.dueDate)) || "&nbsp;"}</dd>${deliveryRow}
          ${data.lateInterest ? `<dt>${L.lateInterest}</dt><dd>${text(data.lateInterest)}</dd>` : ""}
        </dl>
      </div>
    </header>
  `;
}

function buildItemRows(
  items: InvoicePdfItem[],
  L: InvoiceLocale = SV_LOCALE,
): string {
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
          <td class="r nowrap quantity">${L.amount(quantity)}</td>
          <td class="nowrap unit">${text(L.unit(item.unit))}</td>
          <td class="r nowrap amount">${L.amount(price)}</td>
          <td class="r nowrap amount">${L.amount(total)}</td>
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
const HEADER_TOP_BAND_PX = 180; // logo | title, meta, recipient (stacked)
const HEADER_DETAILS_GAP_PX = 80; // margin above the detail row (as on Faktura 65)
const HEADER_BOTTOM_MARGIN_PX = 14;
// The detail row holds 4 lines in Sweden; Norway adds Leveringsdato (5).
const invoiceHeaderHeightPx = (detailsRows: number) =>
  Math.ceil(
    HEADER_PAGE_TOP_PADDING_PX +
      HEADER_TOP_BAND_PX +
      HEADER_DETAILS_GAP_PX +
      detailsRows * (BODY_LINE_HEIGHT_PX + 3) +
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

const invoiceTableHeightPx = (data: InvoicePdfData) =>
  Math.max(
    TABLE_ROW_HEIGHT_PX,
    A4_PAGE_HEIGHT_PX -
      invoiceHeaderHeightPx(localeFor(data).detailsRows) -
      INVOICE_FOOTER_HEIGHT_PX,
  );

function calculateSummaryHeightPx(
  data: InvoicePdfData,
  isReverseVAT: boolean,
): number {
  // Note line (optional) + body. The body is the totals band (~44px) + VAT/bank
  // line (~24px) stacked, sitting beside the payment QR (96px + caption) when
  // present — so the body height is the taller of the two.
  const noteLines = (isReverseVAT ? 1 : 0) + (data.rotEnabled ? 1 : 0);
  const noteHeight = noteLines ? noteLines * BODY_LINE_HEIGHT_PX + 8 : 0;
  const totalsBand = 44;
  const vatLine = 24;
  const qrHeight = data.qrDataUrl ? 96 + 16 : 0;
  const bodyHeight = Math.max(totalsBand + vatLine, qrHeight);
  return Math.ceil(noteHeight + bodyHeight + 8);
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
    Math.max(0, invoiceTableHeightPx(data) - reservedHeight) /
      TABLE_ROW_HEIGHT_PX,
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
    invoiceTableHeightPx(data) -
      reservedHeight -
      itemCount * TABLE_ROW_HEIGHT_PX,
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
  const L = localeFor(data);
  const items = data.items || [];
  const vatGroups = groupVatByRate(items);
  const subtotal =
    data.subtotal ?? vatGroups.reduce((sum, group) => sum + group.base, 0);
  const totalVat = isReverseVAT
    ? 0
    : vatGroups.reduce((sum, group) => sum + group.amount, 0);
  const total = data.total ?? subtotal + totalVat;
  const rotDeduction = Number(data.rotDeduction) || 0;
  // Norway pays the exact amount (no öresavrundning fallback).
  const roundedTotal =
    data.roundedTotal ??
    (L.no ? total - rotDeduction : Math.round(total - rotDeduction));
  const currency = data.currency || (L.no ? "NOK" : "SEK");
  const footer = data.companyFooter || {};

  // Per-rate VAT breakdown line, e.g. "Moms 25% 345,00 (1 380,00)" — in Norway
  // "Mva 25 % 345,00 (1 380,00)": each rate's VAT and base summed separately
  // (bokføringsforskriften § 5-1-5).
  const vatBreakdown = isReverseVAT
    ? "Omvänd skattskyldighet"
    : vatGroups
        .map((group) =>
          L.no
            ? `${L.vatLine} ${group.rate}&nbsp;% ${L.amount(group.amount)} (${L.amount(group.base)})`
            : `Moms ${group.rate}% ${formatInvoiceAmount(group.amount)} (${formatInvoiceAmount(group.base)})`,
        )
        .join("&nbsp;&nbsp;");

  const ibanPart = footer.iban
    ? `<b>IBAN</b> ${text(footer.iban)}${footer.bic ? `&nbsp;&nbsp;<b>BIC</b> ${text(footer.bic)}` : ""}`
    : "";
  // Norway: kontonummer + KID are what the payer types into the nettbank.
  // A credit note is not paid by the customer: no payment line at all.
  const noPayParts =
    L.no && !data.creditOfNumber
      ? [
          footer.kontonummer
            ? `<b>Kontonr.</b> ${text(formatKontonummer(footer.kontonummer))}`
            : "",
          data.kid ? `<b>KID</b> ${text(data.kid)}` : "",
          ibanPart,
        ].filter(Boolean)
      : [];
  const bankLine = L.no
    ? noPayParts.length
      ? `<span class="bank">${noPayParts.join("&nbsp;&nbsp;")}</span>`
      : "<span></span>"
    : footer.iban
      ? `<span class="bank">${ibanPart}</span>`
      : "<span></span>";

  // Optional note lines (reverse VAT / ROT) sit above the totals band.
  const notes: string[] = [];
  if (isReverseVAT) {
    notes.push("Omvänd skattskyldighet för byggtjänster gäller");
  }
  if (data.rotEnabled) {
    notes.push(
      `${deductionMeta(data.deductionType).label}: personnr ${text(data.rotPersonalNumber) || "—"}${data.rotProperty ? `, fastighet ${text(data.rotProperty)}` : ""}`,
    );
  }
  const noteHtml = notes.length
    ? `<div class="invoice-summary__note" style="font-style: italic;">${notes.join("<br>")}</div>`
    : "";

  // Payment QR (Swedish BGC format), pre-rendered upstream. Shown only when a
  // Bankgiro/Plusgiro is configured so there is something to scan-and-pay.
  const qrHtml =
    data.qrDataUrl && !L.no
      ? `<div class="invoice-summary__qr"><img src="${data.qrDataUrl}" alt="" /><span>Skanna för att betala</span></div>`
      : "";

  return `
    <tfoot class="invoice-lines__footer">
      <tr>
        <td colspan="6" class="invoice-summary-cell">
          <div class="invoice-summary">
            ${noteHtml}
            <div class="invoice-summary__body">
              ${qrHtml}
              <div class="invoice-summary__main">
                <div class="invoice-summary__totals">
                  <div>
                    <div class="lbl">${L.exVat}</div>
                    <div class="val">${L.amount(subtotal)}</div>
                  </div>
                  <div>
                    <div class="lbl">${L.vat}</div>
                    <div class="val">${L.amount(totalVat)}</div>
                  </div>
                  <div>
                    <div class="lbl">${L.total}</div>
                    <div class="val">${L.amount(total)}</div>
                  </div>
                  <div>
                    <div class="lbl att-lbl">${L.toPay}</div>
                    <div class="val att-val">${L.no && currency === "NOK" ? "kr" : text(currency)} ${L.amount(roundedTotal)}</div>
                  </div>
                </div>
                <div class="invoice-summary__vat">
                  <span>${vatBreakdown}</span>
                  ${bankLine}
                </div>
              </div>
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
  const L = localeFor(data);

  return `
    <table class="invoice-lines" style="height:${invoiceTableHeightPx(data)}px;">
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
          <th class="nowrap">${L.colArt}</th>
          <th class="description">${L.colDesc}</th>
          <th class="r nowrap quantity">${L.colQty}</th>
          <th class="nowrap unit">${L.colUnit}</th>
          <th class="r nowrap amount">${L.colPrice}</th>
          <th class="r nowrap amount">${L.colSum}</th>
        </tr>
      </thead>
      <tbody>
        ${buildItemRows(items, L)}
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
      <div class="invoice-page__footer">${localeFor(data).no ? buildNoFooter(data.companyFooter) : buildFooter(data.companyFooter)}</div>
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

// Norwegian footer: seller identity per bokføringsforskriften § 5-1-2 — name,
// address, org.nr (+ «MVA» when VAT-registered) and «Foretaksregisteret» only
// when the company says it is registered there. Never Bankgiro/Plusgiro.
function buildNoFooter(footer: InvoicePdfCompanyFooter = {}): string {
  const L = NB_LOCALE;
  const org = formatNoOrgNumber(footer.orgNumber, footer.mvaRegistered);
  return `
    <div class="invoice-footer">
      <div>
        <b>${L.address}</b>
        ${text(footer.name)}<br>${text(footer.address)}<br>${text(footer.city)}<br>${text(footer.country || L.defaultCountry)}
      </div>
      <div>
        <b>${L.phone}</b>${text(footer.phone)}
        <b class="gap">${L.email}</b>${text(footer.email)}
        <b class="gap">${L.web}</b>${text(footer.website)}
      </div>
      <div>
        <b>Kontonummer</b>${text(formatKontonummer(footer.kontonummer))}
      </div>
      <div>
        <b>${L.orgNo}</b>${text(org)}
        ${footer.foretaksregisteret ? `<span class="gap">Foretaksregisteret</span>` : ""}
      </div>
    </div>
  `;
}

export function buildInvoicePdfHtmlPuppeteer(
  data: InvoicePdfData,
  logoDataUrl = "",
): string {
  // Swedish-only features never reach a Norwegian invoice: no ROT/RUT note and
  // no «omvänd skattskyldighet» (NO reverse charge is not supported).
  if (isNorway(data.country)) {
    data = {
      ...data,
      reverseVAT: "false",
      rotEnabled: false,
      qrDataUrl: undefined,
    };
  }
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
<html lang="${localeFor(data).lang}">
<head>
  <meta charset="utf-8" />
  <title>${data.creditOfNumber && localeFor(data).no ? "Kreditnota" : "Faktura"} ${text(data.invoiceNumber)}</title>
  <style>${INVOICE_PDF_CSS}</style>
</head>
<body>
  <main class="invoice-document">${pagesHtml}</main>
</body>
</html>`;
}
