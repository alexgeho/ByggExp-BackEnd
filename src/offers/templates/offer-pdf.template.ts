// Offer (offert / tilbud) PDF. Built from the shared document component — the
// same page, fonts, header classes, line table, totals band and footer as the
// invoice (owner 2026-11-18). This file adds what only an offer has: the
// heading, the rich-text sections and the contact persons.
import sanitizeHtml from "sanitize-html";
import {
  DOCUMENT_PDF_CSS,
  InvoiceLocale,
  InvoicePdfCompanyFooter,
  buildFooter,
  buildLinesTableHtml,
  buildNoFooter,
  buildSummaryBand,
  localeFor,
  multilineText,
  text,
} from "../../common/pdf/document-pdf";

// Same footer data as the invoice (address, contacts, giro, org / VAT no).
export type OfferPdfCompanyFooter = InvoicePdfCompanyFooter;

export type OfferPdfContactPerson = {
  role?: string;
  name?: string;
};

export type OfferPdfItem = {
  articleNumber?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  price?: number;
  discount?: number;
  vatRate?: number;
};

// Recipient block, as on the invoice: name, street, postal code + city.
export function recipientHtml(data: OfferPdfData): string {
  const place = [data.postalCode, data.city]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(" ");
  return [data.companyName, data.address, place]
    .map((line) => text(line) || "&nbsp;")
    .join("<br>\n                ");
}

// One "label  value" pair of the detail row; nothing when the value is empty.
function pair(label: string, value?: string): string {
  const v = (value || "").trim();
  return v ? `<dt>${label}</dt><dd>${text(v)}</dd>` : "";
}

export type OfferPdfData = {
  offerNumber?: string;
  companyName?: string;
  email?: string;
  clientType?: string;
  contactPerson?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  orgNumber?: string;
  phone?: string;
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
  // Seller's home market ("SE" | "NO"). Missing = Sweden (unchanged output).
  country?: string;
};

// Rich-text fields (description, clarifications) may contain HTML from the
// admin editor (bold, bullet/numbered lists). Sanitize to a safe whitelist so
// nothing malicious reaches the PDF renderer. Plain-text values (older offers,
// or typed without formatting) have no tags — render them with <br> for
// newlines so they look the same as before.
function richHtml(value?: string): string {
  const raw = (value ?? "").toString();
  if (!raw.trim()) return "";
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(raw);
  if (!looksLikeHtml) {
    return multilineText(raw);
  }
  return sanitizeHtml(raw, {
    allowedTags: [
      "b",
      "strong",
      "i",
      "em",
      "u",
      "p",
      "br",
      "ul",
      "ol",
      "li",
      "span",
    ],
    allowedAttributes: {},
  });
}

// Offer-only parts on top of the shared document look. Top and bottom of the
// sheet are the invoice's (header, detail row, totals band pinned above the
// footer); the offer's text sits in between, in the document's type sizes.
// The text can be any length, so the sheet flows over pages: the page margins
// live on @page, so every page keeps them.
const OFFER_PDF_CSS = `
@page { size: A4; margin: 14mm 0 8mm; }
.offer-sheet { width: 210mm; min-height: 274mm; display: flex; flex-direction: column; }
.offer-sheet .invoice-page__header { padding-top: 0; }
.offer-sheet .invoice-page__footer { padding-bottom: 0; }
.offer-sheet .invoice-header__details dd { white-space: normal; }
.offer-subtitle { font-size: 15px; font-weight: bold; margin: 12px 0 10px; padding: 0 10px; }
.offer-section { margin: 0 0 18px; padding: 0 10px; }
.offer-section__title { font-size: 13px; font-weight: bold; margin: 0 0 2px; }
.offer-section__text { word-break: break-word; }
.offer-section__text p { margin: 0 0 6px; }
.offer-section__text ul, .offer-section__text ol { margin: 4px 0 6px; padding-left: 20px; }
.offer-section__text li { margin: 2px 0; }
.offer-lines { margin: 0 0 22px; }
.offer-totals { margin-top: auto; padding-top: 22px; break-inside: avoid; }
.offer-price {
  border-top: 1px solid #d5dae1;
  border-bottom: 1px solid #d5dae1;
  padding: 10px;
  font-size: 14px;
  font-weight: bold;
  margin: 0 0 22px;
  white-space: pre-wrap;
}
`;

// Offer wording per seller country. Table columns, totals and footer labels
// come from the shared document locale.
type OfferWords = {
  title: string;
  offerNo: string;
  date: string;
  validUntil: string;
  description: string;
  clarifications: string;
  personNo: string;
  phone: string;
  email: string;
  // An offer delivers nothing yet: "Antal", not the invoice's "Lev ant".
  columns: Partial<InvoiceLocale>;
};

const SV_WORDS: OfferWords = {
  title: "Offert",
  offerNo: "Offertnr",
  date: "Datum",
  validUntil: "Giltig till",
  description: "Beskrivning",
  clarifications: "Förtydliganden",
  personNo: "Personnr",
  phone: "Telefon",
  email: "E-post",
  columns: { colQty: "Antal" },
};

// Norwegian bokmål quote (tilbud).
const NB_WORDS: OfferWords = {
  title: "Tilbud",
  offerNo: "Tilbudsnr.",
  date: "Dato",
  validUntil: "Gyldig til",
  description: "Beskrivelse",
  clarifications: "Forbehold og avklaringer",
  personNo: "Fødselsnr",
  phone: "Telefon",
  email: "E-post",
  columns: {},
};

function section(title: string, body: string): string {
  if (!body || !body.trim()) return "";
  return `
    <div class="offer-section">
      <p class="offer-section__title">${title}</p>
      <div class="offer-section__text">${richHtml(body)}</div>
    </div>
  `;
}

export function buildOfferPdfHtml(
  data: OfferPdfData,
  logoDataUrl = "",
): string {
  const L: InvoiceLocale = { ...localeFor(data) };
  const W = L.no ? NB_WORDS : SV_WORDS;
  Object.assign(L, W.columns);
  const logo = logoDataUrl ? `<img src="${logoDataUrl}" alt="" />` : "";

  // Detail row, as on the invoice: the customer's references on the left, ours
  // on the right. Each contact person prints as "role  name".
  const isPrivate = data.clientType === "private";
  const customerPairs = [
    isPrivate ? "" : pair(L.yourRef, data.contactPerson),
    pair(isPrivate ? W.personNo : "Org.nr", data.orgNumber),
    pair(W.phone, data.phone),
    pair(W.email, data.email),
  ].join("");
  const ourPairs = [
    ...(data.contactPersons || [])
      .filter((c) => c && (c.name || "").trim())
      .map((c) => pair(text((c.role || "").trim()) || L.ourRef, c.name)),
    pair(W.validUntil, L.date(data.validUntil)),
  ].join("");

  const items = (data.items || []).filter(
    (it) =>
      it &&
      (String(it.description || "").trim() ||
        Number(it.price) ||
        Number(it.quantity)),
  );

  // Line table of the shared document; the totals band is pinned above the
  // footer like on the invoice. The offer is not paid, so the amount is exact
  // (no öresavrundning) and there is no bank line or QR.
  const linesHtml = items.length
    ? `<div class="offer-lines">${buildLinesTableHtml(L, items)}</div>`
    : data.priceText && data.priceText.trim()
      ? `<div class="offer-price">${text(data.priceText)}</div>`
      : "";
  const totalsHtml = items.length
    ? `<div class="offer-totals">${buildSummaryBand(
        {
          items,
          subtotal: data.subtotal,
          total: data.total,
          roundedTotal: data.total,
          country: data.country,
        },
        false,
      )}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="${L.lang}">
<head>
  <meta charset="utf-8" />
  <title>${W.title} ${text(data.offerNumber)}</title>
  <style>${DOCUMENT_PDF_CSS}${OFFER_PDF_CSS}</style>
</head>
<body>
  <main class="invoice-document">
    <section class="offer-sheet">
      <div class="invoice-page__header">
        <header class="invoice-header">
          <div class="invoice-header__top">
            <div class="invoice-header__logo">${logo}</div>
            <div>
              <div class="invoice-header__title">${W.title}</div>
              <dl class="invoice-header__meta">
                <dt>${W.date}</dt><dd>${text(L.date(data.date)) || "&nbsp;"}</dd>
                <dt>${W.offerNo}</dt><dd>${text(data.offerNumber) || "&nbsp;"}</dd>
              </dl>
              <div class="invoice-header__recipient">
                ${recipientHtml(data)}
              </div>
            </div>
          </div>
          <div class="invoice-header__details">
            <dl>${customerPairs}</dl>
            <dl>${ourPairs}</dl>
          </div>
        </header>
      </div>
      <div class="invoice-page__body">
        <div>
          ${data.subtitle ? `<h1 class="offer-subtitle">${text(data.subtitle)}</h1>` : ""}
          ${section(W.description, data.description || "")}
          ${linesHtml}
          ${section(W.clarifications, data.clarifications || "")}
        </div>
        ${totalsHtml}
      </div>
      <div class="invoice-page__footer">${L.no ? buildNoFooter(data.companyFooter) : buildFooter(data.companyFooter)}</div>
    </section>
  </main>
</body>
</html>`;
}
