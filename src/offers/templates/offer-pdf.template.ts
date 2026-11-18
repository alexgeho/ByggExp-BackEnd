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

// Recipient block: name, the customer details that are filled in, then the
// email line (kept even when empty, as before, so old offers print unchanged).
export function recipientHtml(
  data: OfferPdfData,
  orgLabel: string,
  personLabel: string,
): string {
  const isPrivate = data.clientType === "private";
  const place = [data.postalCode, data.city]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(" ");
  const org = (data.orgNumber || "").trim();
  const lines = [
    isPrivate ? "" : data.contactPerson,
    data.address,
    place,
    org ? `${isPrivate ? personLabel : orgLabel} ${org}` : "",
    data.phone,
  ]
    .map((line) => text(line))
    .filter(Boolean);
  return [
    text(data.companyName) || "&nbsp;",
    ...lines,
    text(data.email) || "&nbsp;",
  ].join("<br>\n          ");
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

// Offer-only parts on top of the shared document look: a flowing sheet (the
// text can be any length, so no fixed-height pages) and the text sections,
// in the document's own type sizes.
const OFFER_PDF_CSS = `
.offer-sheet { width: 210mm; min-height: 297mm; display: flex; flex-direction: column; }
.offer-sheet .invoice-header__recipient { margin-bottom: 48px; }
.offer-subtitle { font-size: 16px; font-weight: bold; margin: 0 0 16px; }
.offer-section { margin: 0 0 22px; }
.offer-section__title { font-size: 13px; font-weight: bold; margin: 0 0 4px; }
.offer-section__text { word-break: break-word; }
.offer-section__text p { margin: 0 0 6px; }
.offer-section__text ul, .offer-section__text ol { margin: 4px 0 6px; padding-left: 20px; }
.offer-section__text li { margin: 2px 0; }
.offer-lines { margin: 0 0 22px; }
.offer-lines .invoice-summary { margin-top: 14px; break-inside: avoid; }
.offer-price {
  border: 1px solid #d5dae1;
  padding: 10px;
  font-size: 15px;
  font-weight: bold;
  margin: 0 0 22px;
  white-space: pre-wrap;
}
.offer-contacts { margin: 0 0 22px; break-inside: avoid; }
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
  contacts: string;
  personNo: string;
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
  contacts: "Kontaktpersoner",
  personNo: "Personnr",
  columns: { colDesc: "Beskrivning", colQty: "Antal", colSum: "Belopp" },
};

// Norwegian bokmål quote (tilbud).
const NB_WORDS: OfferWords = {
  title: "Tilbud",
  offerNo: "Tilbudsnr.",
  date: "Dato",
  validUntil: "Gyldig til",
  description: "Beskrivelse",
  clarifications: "Forbehold og avklaringer",
  contacts: "Kontaktpersoner",
  personNo: "Fødselsnr",
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

  const contacts = (data.contactPersons || []).filter(
    (c) => c && (c.name || c.role),
  );
  const contactsHtml = contacts.length
    ? `
      <div class="offer-contacts">
        <p class="offer-section__title">${W.contacts}</p>
        ${contacts
          .map(
            (c) =>
              `<div class="offer-contacts__row">${text(c.name)}${c.role ? ` — ${text(c.role)}` : ""}</div>`,
          )
          .join("")}
      </div>`
    : "";

  const items = (data.items || []).filter(
    (it) =>
      it &&
      (String(it.description || "").trim() ||
        Number(it.price) ||
        Number(it.quantity)),
  );

  // Line table + totals band of the shared document. The offer is not paid, so
  // the amount is exact (no öresavrundning) and there is no bank line or QR.
  const priceHtml = items.length
    ? `
      <div class="offer-lines">
        ${buildLinesTableHtml(L, items)}
        ${buildSummaryBand(
          {
            items,
            subtotal: data.subtotal,
            total: data.total,
            roundedTotal: data.total,
            country: data.country,
          },
          false,
        )}
      </div>`
    : data.priceText && data.priceText.trim()
      ? `<div class="offer-price">${text(data.priceText)}</div>`
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
                <dt>${W.offerNo}</dt><dd>${text(data.offerNumber) || "&nbsp;"}</dd>
                <dt>${W.date}</dt><dd>${text(L.date(data.date)) || "&nbsp;"}</dd>
                <dt>${W.validUntil}</dt><dd>${text(L.date(data.validUntil)) || "&nbsp;"}</dd>
              </dl>
              <div class="invoice-header__recipient">
                ${recipientHtml(data, "Org.nr", W.personNo)}
              </div>
            </div>
          </div>
        </header>
      </div>
      <div class="invoice-page__body">
        <div>
          ${data.subtitle ? `<h1 class="offer-subtitle">${text(data.subtitle)}</h1>` : ""}
          ${section(W.description, data.description || "")}
          ${priceHtml}
          ${section(W.clarifications, data.clarifications || "")}
          ${contactsHtml}
        </div>
      </div>
      <div class="invoice-page__footer">${L.no ? buildNoFooter(data.companyFooter) : buildFooter(data.companyFooter)}</div>
    </section>
  </main>
</body>
</html>`;
}
