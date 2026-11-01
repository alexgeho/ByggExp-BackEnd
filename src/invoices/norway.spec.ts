import {
  formatKontonummer,
  formatNok,
  formatNoDate,
  formatNoOrgNumber,
  generateKid,
  isValidKid,
  isValidKontonummer,
  vatRatesForCountry,
} from "./norway";
import { buildInvoicePdfHtmlPuppeteer } from "./templates/invoice-pdf.template";
import { buildOfferPdfHtml } from "../offers/templates/offer-pdf.template";

const NBSP = " ";

describe("kontonummer (MOD11)", () => {
  it.each(["8601.11.17947", "86011117947", "1234 56 78903"])(
    "accepts %s",
    (n) => expect(isValidKontonummer(n)).toBe(true),
  );
  it.each(["86011117948", "8601111794", "123456789012", "", "abcdefghijk"])(
    "rejects %s",
    (n) => expect(isValidKontonummer(n)).toBe(false),
  );
  it("rejects a body whose check digit would be 10", () => {
    // 0000000010x: weights 3*1 = 3 → 11-3 = 8, valid; find a "10" body.
    // 1000000001: 1*5 + 1*2 = 7 → 11-7 = 4; use 0000000006 → 6*2=12 → 12%11=1 → 10.
    expect(isValidKontonummer("00000000060")).toBe(false);
  });
  it("formats as 4.2.5", () => {
    expect(formatKontonummer("86011117947")).toBe("8601.11.17947");
  });
});

describe("KID", () => {
  it("MOD10 (Luhn) from the invoice number", () => {
    expect(generateKid(1234, "mod10")).toBe("12344");
    expect(generateKid(39, "mod10")).toBe("398");
    expect(isValidKid("12344", "mod10")).toBe(true);
    expect(isValidKid("12345", "mod10")).toBe(false);
  });
  it("MOD11 from the invoice number", () => {
    expect(generateKid(1234, "mod11")).toBe("12343");
    expect(generateKid(39, "mod11")).toBe("396");
    // 6 → 6*2 = 12, 12 % 11 = 1 → check 10 → "-".
    expect(generateKid(6, "mod11")).toBe("6-");
    expect(isValidKid("12343", "mod11")).toBe(true);
  });
  it("is empty when switched off", () => {
    expect(generateKid(1234, "none")).toBe("");
    expect(generateKid(1234, undefined)).toBe("");
  });
});

describe("formatting", () => {
  it("money as kr 1 234,50 (nb-NO)", () => {
    expect(formatNok(1234.5)).toBe(`kr 1${NBSP}234,50`);
  });
  it("dates as dd.mm.yyyy", () => {
    expect(formatNoDate("2026-08-13")).toBe("13.08.2026");
  });
  it("org.nr with MVA only when VAT-registered", () => {
    expect(formatNoOrgNumber("923456789", true)).toBe("923 456 789 MVA");
    expect(formatNoOrgNumber("923456789", false)).toBe("923 456 789");
  });
  it("VAT rates are country-aware", () => {
    expect(vatRatesForCountry("NO")).toEqual([25, 15, 12, 0]);
    expect(vatRatesForCountry("SE")).toEqual([25, 12, 6, 0]);
    expect(vatRatesForCountry(undefined)).toEqual([25, 12, 6, 0]);
  });
});

const noFooter = {
  name: "Fjord Bygg AS",
  address: "Storgata 1",
  city: "0155 Oslo",
  phone: "+4722000000",
  email: "post@fjordbygg.no",
  website: "fjordbygg.no",
  orgNumber: "923456789",
  kontonummer: "86011117947",
  mvaRegistered: true,
  foretaksregisteret: true,
  // Swedish leftovers that must not print for NO:
  bankgiro: "256-7030",
  vatStatus: "Godkänd för F-skatt",
};

const noInvoice = {
  country: "NO",
  currency: "NOK",
  invoiceNumber: "1234",
  kid: "12343",
  companyName: "Kunde AS",
  address: "Kundeveien 2",
  postalCode: "5003 Bergen",
  customerNumber: "10",
  date: "2026-08-13",
  deliveryDate: "2026-08-10",
  dueDate: "2026-08-27",
  ourReference: "Ola",
  items: [
    {
      articleNumber: "1",
      description: "Arbeid",
      quantity: 10,
      unit: "t",
      price: 800,
      vatRate: 25,
    },
    {
      articleNumber: "2",
      description: "Mat",
      quantity: 2,
      unit: "st",
      price: 100,
      vatRate: 15,
    },
  ],
  subtotal: 8200,
  vat: 2030,
  total: 10230,
  roundedTotal: 10230,
  companyFooter: noFooter,
  // Must be ignored for NO:
  reverseVAT: "true",
  rotEnabled: true,
  qrDataUrl: "data:image/png;base64,QR",
};

describe("NO invoice PDF", () => {
  const html = buildInvoicePdfHtmlPuppeteer(noInvoice);

  it("is in Norwegian bokmål", () => {
    expect(html).toContain('<html lang="nb">');
    for (const label of [
      "Faktura",
      "Fakturadato",
      "Fakturanr.",
      "Forfallsdato",
      "Leveringsdato",
      "Beskrivelse",
      "Antall",
      "Enhetspris",
      "Beløp",
      "Sum eks. mva",
      "Mva",
      "Å BETALE",
      "Kontonummer",
      "KID",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("has no Swedish words or SE payment rails", () => {
    // The shared stylesheet has Swedish CSS comments; check the content only.
    const body = html.replace(/<style>[\s\S]*?<\/style>/, "");
    for (const sv of [
      "Moms",
      "Bankgiro",
      "Plusgiro",
      "OCR",
      "F-skatt",
      "ATT BETALA",
      "Förfallodatum",
      "Omvänd",
      "ROT",
      "Skanna",
      "Sverige",
    ]) {
      expect(body).not.toContain(sv);
    }
  });

  it("prints dates dd.mm.yyyy and amounts in nb-NO with kr", () => {
    expect(html).toContain("13.08.2026");
    expect(html).toContain("27.08.2026");
    expect(html).toContain(`kr 10${NBSP}230,00`);
  });

  it("breaks VAT down per rate (25 % and 15 %)", () => {
    expect(html).toContain(`Mva 25&nbsp;% 2${NBSP}000,00 (8${NBSP}000,00)`);
    expect(html).toContain("Mva 15&nbsp;% 30,00 (200,00)");
  });

  it("prints org.nr with MVA and Foretaksregisteret, kontonummer and KID", () => {
    expect(html).toContain("923 456 789 MVA");
    expect(html).toContain("Foretaksregisteret");
    expect(html).toContain("8601.11.17947");
    expect(html).toContain("<dt>KID</dt><dd>12343</dd>");
    expect(html).toContain("Norge");
  });

  it("omits MVA / Foretaksregisteret / KID when the company data says no", () => {
    const plain = buildInvoicePdfHtmlPuppeteer({
      ...noInvoice,
      kid: "",
      companyFooter: {
        ...noFooter,
        mvaRegistered: false,
        foretaksregisteret: false,
      },
    });
    expect(plain).not.toContain(" MVA");
    expect(plain).not.toContain("Foretaksregisteret");
    expect(plain).not.toContain("<dt>KID</dt>");
  });

  it("renders a credit note as Kreditnota", () => {
    const credit = buildInvoicePdfHtmlPuppeteer({
      ...noInvoice,
      creditOfNumber: 12,
    });
    expect(credit).toContain("Kreditnota");
    expect(credit).toContain("Gjelder faktura");
  });
});

describe("NO offer (tilbud) PDF", () => {
  const html = buildOfferPdfHtml({
    country: "NO",
    offerNumber: "5",
    companyName: "Kunde AS",
    date: "2026-08-01",
    validUntil: "2026-08-31",
    items: [
      {
        description: "Arbeid",
        quantity: 2,
        unit: "st",
        price: 1000,
        vatRate: 25,
      },
    ],
    subtotal: 2000,
    vat: 500,
    total: 2500,
    companyFooter: noFooter,
  });

  it("is in Norwegian with NOK and dd.mm.yyyy", () => {
    for (const label of [
      "Tilbud",
      "Tilbudsnr.",
      "Gyldig til",
      "Enhetspris",
      "Sum eks. mva",
      "stk",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("31.08.2026");
    expect(html).toContain(`kr 2${NBSP}500,00`);
    expect(html).toContain("923 456 789 MVA");
    for (const sv of [
      "Offert",
      "moms",
      "Moms",
      "F-skatt",
      "Giltig",
      "Att betala",
    ]) {
      expect(html).not.toContain(sv);
    }
  });
});

describe("NO invoice — leveringssted and credit notes", () => {
  it("prints Leveringssted next to Leveringsdato", () => {
    const html = buildInvoicePdfHtmlPuppeteer({
      ...noInvoice,
      deliveryPlace: "Byggeplass, Kirkeveien 5, 0368 Oslo",
    });
    const date = html.indexOf("<dt>Leveringsdato</dt>");
    const place = html.indexOf("<dt>Leveringssted</dt>");
    expect(date).toBeGreaterThan(-1);
    expect(place).toBeGreaterThan(date);
    expect(html).toContain("Byggeplass, Kirkeveien 5, 0368 Oslo");
  });

  it("credit note has no KID and no payment line", () => {
    const html = buildInvoicePdfHtmlPuppeteer({
      ...noInvoice,
      creditOfNumber: 12,
    });
    expect(html).not.toContain("<dt>KID</dt>");
    expect(html).not.toContain("<b>KID</b>");
    expect(html).not.toContain("<b>Kontonr.</b>");
  });
});
