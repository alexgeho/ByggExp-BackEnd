// Guards the Swedish invoice/offer PDFs byte-for-byte. The snapshots were
// recorded BEFORE Norwegian support was added; any change to SE output fails
// here. Never update these snapshots for a NO-only change.
import { buildInvoicePdfHtmlPuppeteer } from "./templates/invoice-pdf.template";
import { buildOfferPdfHtml } from "../offers/templates/offer-pdf.template";

const footer = {
  name: "Geal Entreprenad AB",
  address: "Byggmästarvägen 18",
  city: "168 32 Bromma",
  phone: "+46707577574",
  email: "mg@gealab.nu",
  website: "gealan.nu",
  orgNumber: "559303-7566",
  vatNumber: "SE559303-756601",
  vatStatus: "Godkänd för F-skatt",
  bankgiro: "256-7030",
  iban: "SE45 5000 0000 0583 9825 7466",
  bic: "ESSESESS",
};

const items = [
  { articleNumber: "1", description: "Arbete", quantity: 12.5, unit: "h", price: 495, vatRate: 25 },
  { articleNumber: "2", description: "Material\nrad två", quantity: 3, unit: "st", price: 1234.5, discount: 10, vatRate: 12 },
  { articleNumber: "3", description: "Böcker", quantity: 1, unit: "st", price: 99, vatRate: 6 },
  { isText: true, description: "Tillkommande arbeten" },
];

const invoiceBase = {
  invoiceNumber: "39",
  companyName: "Svensson Fastigheter AB",
  vatNumber: "SE556677889901",
  address: "Kungsportsavenyen 21",
  postalCode: "411 36 Göteborg",
  customerNumber: "1001",
  date: "2026-08-13",
  deliveryDate: "2026-08-10",
  dueDate: "2026-09-12",
  ourReference: "Maria",
  yourReference: "Kalle",
  orderReference: "PO-77",
  lateInterest: "8 %",
  ocr: "398",
  items,
  companyFooter: footer,
};

describe("SE PDF output is unchanged", () => {
  it("invoice — standard", () => {
    expect(buildInvoicePdfHtmlPuppeteer({ ...invoiceBase }, "data:image/png;base64,AAA")).toMatchSnapshot();
  });

  it("invoice — reverse VAT", () => {
    expect(buildInvoicePdfHtmlPuppeteer({ ...invoiceBase, reverseVAT: "true" })).toMatchSnapshot();
  });

  it("invoice — ROT, rounding, currency, QR", () => {
    expect(
      buildInvoicePdfHtmlPuppeteer({
        ...invoiceBase,
        subtotal: 10000,
        vat: 2500,
        total: 12500,
        rotEnabled: true,
        deductionType: "rot",
        rotPersonalNumber: "19800101-1234",
        rotProperty: "Bromma 1:23",
        rotDeduction: 1500,
        rounding: 0.4,
        roundedTotal: 11000,
        currency: "SEK",
        qrDataUrl: "data:image/png;base64,QR",
      }),
    ).toMatchSnapshot();
  });

  it("invoice — credit note, plusgiro, many rows", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      articleNumber: String(i + 1),
      description: `Rad ${i + 1}`,
      quantity: 1,
      unit: "st",
      price: 1000,
      vatRate: 25,
    }));
    expect(
      buildInvoicePdfHtmlPuppeteer({
        ...invoiceBase,
        items: many,
        creditOfNumber: 12,
        companyFooter: { ...footer, bankgiro: "", plusgiro: "12 34 56-7", iban: "" },
      }),
    ).toMatchSnapshot();
  });

  it("offer — items", () => {
    expect(
      buildOfferPdfHtml(
        {
          offerNumber: "7",
          companyName: "Kund AB",
          email: "kund@example.se",
          date: "2026-08-01",
          validUntil: "2026-08-31",
          subtitle: "Takbyte",
          description: "<ul><li>A</li></ul>",
          clarifications: "Rad 1\nRad 2",
          contactPersons: [{ name: "Maria", role: "Projektledare" }],
          items: items.filter((i) => !i.isText),
          subtotal: 9775.65,
          vat: 2043.31,
          total: 11818.96,
          companyFooter: footer,
        },
        "data:image/png;base64,AAA",
      ),
    ).toMatchSnapshot();
  });

  it("offer — price text", () => {
    expect(
      buildOfferPdfHtml({
        offerNumber: "8",
        companyName: "Kund AB",
        priceText: "Fast pris 100 000 kr exkl. moms",
        companyFooter: footer,
      }),
    ).toMatchSnapshot();
  });
});
