// Invoice (faktura) PDF. The look — page, fonts, line table, totals band,
// footer — lives in the shared document component; this file adds what only an
// invoice has: its header rows and the fixed-height pagination.
import {
  DOCUMENT_PDF_CSS,
  InvoicePdfCompanyFooter,
  InvoicePdfData,
  InvoicePdfItem,
  buildFooter,
  buildLinesTableHtml,
  buildNoFooter,
  buildSummary,
  formatInvoiceAmount,
  localeFor,
  text,
} from "../../common/pdf/document-pdf";
import { isNorway } from "../norway";

export { formatInvoiceAmount };
export type { InvoicePdfCompanyFooter, InvoicePdfData, InvoicePdfItem };

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

  return buildLinesTableHtml(L, items, {
    heightPx: invoiceTableHeightPx(data),
    fillerRow,
    summaryFooter,
  });
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
  <style>${DOCUMENT_PDF_CSS}</style>
</head>
<body>
  <main class="invoice-document">${pagesHtml}</main>
</body>
</html>`;
}
