import {
  buildFortnoxCustomer,
  buildFortnoxInvoice,
  buildFortnoxTaxReduction,
  buildFortnoxWageTransactions,
  splitPostalCode,
  taxReductionType,
  toFortnoxOrgNumber,
  mapSupplierInvoice,
  matchProject,
} from "./fortnox-mapping";
import {
  signState,
  verifyState,
  encryptToken,
  decryptToken,
} from "./fortnox-crypto";
import type { WageItem } from "../payroll/wage-basis";

describe("toFortnoxOrgNumber", () => {
  it("formats org.nr, personnummer and Swedish VAT numbers", () => {
    expect(toFortnoxOrgNumber("5566778899")).toBe("556677-8899");
    expect(toFortnoxOrgNumber("556677-8899")).toBe("556677-8899");
    expect(toFortnoxOrgNumber("19800101-1234")).toBe("800101-1234");
    expect(toFortnoxOrgNumber("SE556677889901")).toBe("556677-8899");
    expect(toFortnoxOrgNumber("NO 123")).toBe("");
    expect(toFortnoxOrgNumber("")).toBe("");
  });
});

describe("splitPostalCode", () => {
  it('splits "123 45 Stad"', () => {
    expect(splitPostalCode("123 45 Stockholm")).toEqual({
      zip: "12345",
      city: "Stockholm",
    });
    expect(splitPostalCode("Lund")).toEqual({ zip: "", city: "Lund" });
  });
});

const baseInvoice = {
  invoiceNumber: 1042,
  companyName: "Bygg & Co AB",
  vatNumber: "SE556677889901",
  address: "Storgatan 1",
  postalCode: "211 20 Malmö",
  email: "kund@example.se",
  date: "2026-10-01",
  dueDate: "2026-10-31",
  ourReference: "Anna",
  yourReference: "Erik",
  orderReference: "PO-77",
  reverseVAT: "false",
  items: [
    {
      description: "<b>Rivning</b> kök",
      quantity: 10,
      unit: "h",
      price: 650,
      vatRate: 25,
    },
    {
      description: "Gips",
      quantity: 3,
      unit: "st",
      price: 120,
      discount: 10,
      vatRate: 25,
    },
    { description: "Material enligt följesedel", isText: true },
    {
      description: "Container",
      quantity: 1,
      unit: "vecka",
      price: 2000,
      vatRate: 25,
    },
  ],
};

describe("buildFortnoxCustomer", () => {
  it("maps a company customer with org.nr and address", () => {
    const c = buildFortnoxCustomer(baseInvoice);
    expect(c).toMatchObject({
      Name: "Bygg & Co AB",
      Type: "COMPANY",
      OrganisationNumber: "556677-8899",
      VATNumber: "SE556677889901",
      Address1: "Storgatan 1",
      ZipCode: "21120",
      City: "Malmö",
      Email: "kund@example.se",
    });
    expect(c).not.toHaveProperty("VATType");
  });

  it("uses the client register and reverse charge", () => {
    const c = buildFortnoxCustomer(
      { ...baseInvoice, vatNumber: "", reverseVAT: "true" },
      {
        clientType: "company",
        orgNumber: "559999-0001",
        postalCode: "111 22",
        city: "Stockholm",
      },
    );
    expect(c.OrganisationNumber).toBe("559999-0001");
    expect(c.ZipCode).toBe("11122");
    expect(c.City).toBe("Stockholm");
    expect(c.VATType).toBe("SEREVERSEDVAT");
  });

  it("a ROT invoice without client is a private customer keyed on personnummer", () => {
    const c = buildFortnoxCustomer({
      ...baseInvoice,
      vatNumber: "",
      rotEnabled: true,
      rotPersonalNumber: "198001011234",
    });
    expect(c.Type).toBe("PRIVATE");
    expect(c.OrganisationNumber).toBe("800101-1234");
  });
});

describe("buildFortnoxInvoice", () => {
  it("maps header and rows", () => {
    const { Invoice } = buildFortnoxInvoice(baseInvoice, "17", {
      currency: "SEK",
    });
    expect(Invoice).toMatchObject({
      CustomerNumber: "17",
      InvoiceDate: "2026-10-01",
      DueDate: "2026-10-31",
      Currency: "SEK",
      Language: "SV",
      VATIncluded: false,
      OurReference: "Anna",
      YourReference: "Erik",
      YourOrderNumber: "PO-77",
      ExternalInvoiceReference1: "ByggExp 1042",
      TaxReductionType: "none",
    });
    expect(Invoice).not.toHaveProperty("DeliveryDate");
    expect(Invoice.InvoiceRows).toEqual([
      {
        Description: "Rivning kök",
        DeliveredQuantity: "10",
        Price: 650,
        VAT: 25,
        Unit: "tim",
      },
      {
        Description: "Gips",
        DeliveredQuantity: "3",
        Price: 120,
        VAT: 25,
        Unit: "st",
        Discount: 10,
        DiscountType: "PERCENT",
      },
      { Description: "Material enligt följesedel" },
      // Unknown unit is left off rather than rejected by Fortnox.
      {
        Description: "Container",
        DeliveredQuantity: "1",
        Price: 2000,
        VAT: 25,
      },
    ]);
  });

  it("reverse charge sends 0 % VAT", () => {
    const { Invoice } = buildFortnoxInvoice(
      { ...baseInvoice, reverseVAT: "true" },
      "1",
    );
    const rows = Invoice.InvoiceRows as Array<Record<string, unknown>>;
    expect(rows.filter((r) => "VAT" in r).every((r) => r.VAT === 0)).toBe(true);
  });

  it("ROT marks the hour rows as house work", () => {
    const rot = { ...baseInvoice, rotEnabled: true, deductionType: "rot" };
    const { Invoice } = buildFortnoxInvoice(rot, "1");
    expect(Invoice.TaxReductionType).toBe("rot");
    const rows = Invoice.InvoiceRows as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      HouseWork: true,
      HouseWorkType: "CONSTRUCTION",
      HouseWorkHoursToReport: 10,
    });
    expect(rows[1]).not.toHaveProperty("HouseWork");
  });

  it("credit note keeps negative quantities and the reference", () => {
    const credit = {
      ...baseInvoice,
      creditOfNumber: 1001,
      items: [
        {
          description: "Rivning",
          quantity: -5,
          unit: "h",
          price: 650,
          vatRate: 25,
        },
      ],
    };
    const { Invoice } = buildFortnoxInvoice(credit, "1", {
      creditReference: "88",
    });
    expect(Invoice.CreditInvoiceReference).toBe("88");
    expect(
      (Invoice.InvoiceRows as Array<Record<string, unknown>>)[0]
        .DeliveredQuantity,
    ).toBe("-5");
  });

  it("maps deduction kinds", () => {
    expect(taxReductionType({ invoiceNumber: 1 })).toBe("none");
    expect(
      taxReductionType({
        invoiceNumber: 1,
        rotEnabled: true,
        deductionType: "rut",
      }),
    ).toBe("rut");
    expect(
      taxReductionType({
        invoiceNumber: 1,
        rotEnabled: true,
        deductionType: "green50",
      }),
    ).toBe("green");
  });
});

describe("buildFortnoxTaxReduction", () => {
  it("builds a ROT application for the Fortnox invoice", () => {
    const r = buildFortnoxTaxReduction(
      {
        ...baseInvoice,
        rotEnabled: true,
        deductionType: "rot",
        rotPersonalNumber: "19800101-1234",
        rotProperty: "Malmö Gården 1:2",
        rotDeduction: 1950,
      },
      "501",
      "Erik Svensson",
    );
    expect(r).toEqual({
      TaxReduction: {
        CustomerName: "Erik Svensson",
        ReferenceDocumentType: "INVOICE",
        ReferenceNumber: "501",
        SocialSecurityNumber: "800101-1234",
        AskedAmount: 1950,
        PropertyDesignation: "Malmö Gården 1:2",
      },
    });
  });

  it("skips without personnummer, amount or for green technology", () => {
    const rot = { ...baseInvoice, rotEnabled: true, rotDeduction: 100 };
    expect(buildFortnoxTaxReduction(rot, "1", "x")).toBeNull();
    expect(
      buildFortnoxTaxReduction(
        { ...rot, deductionType: "green15", rotPersonalNumber: "8001011234" },
        "1",
        "x",
      ),
    ).toBeNull();
    expect(buildFortnoxTaxReduction(baseInvoice, "1", "x")).toBeNull();
  });
});

const item = (over: Partial<WageItem>): WageItem => ({
  code: "hours_normal",
  label: "Timlön",
  kind: "salary",
  date: "2026-10-01",
  quantity: 8,
  unit: "h",
  unitPrice: 200,
  amount: 1600,
  taxFree: false,
  ...over,
});

describe("buildFortnoxWageTransactions", () => {
  const input = {
    companyName: "X",
    orgNumber: "",
    generatedAt: new Date("2026-11-01"),
    salaryCodes: {
      hours_normal: "11",
      vacation_pay: "310",
      mileage_taxfree: "",
    },
    absenceCodes: { absence_sick: "SJK", absence_other: "XYZ" },
    workers: [
      {
        userId: "u1",
        name: "Anna",
        employeeId: "7",
        items: [
          item({}),
          item({
            code: "vacation_pay",
            label: "Semesterersättning",
            unit: "sek",
            quantity: 0,
            unitPrice: 0,
            amount: 192,
          }),
          item({
            code: "mileage_taxfree",
            unit: "km",
            quantity: 40,
            unitPrice: 2.5,
            amount: 100,
          }),
          item({
            code: "absence_sick",
            kind: "absence",
            quantity: 8,
            amount: 0,
          }),
          item({
            code: "absence_other",
            kind: "absence",
            quantity: 4,
            amount: 0,
          }),
        ],
      },
      { userId: "u2", name: "Bo", employeeId: "", items: [item({})] },
    ],
  };

  it("maps pay items to salary transactions and absence to absence transactions", () => {
    const tx = buildFortnoxWageTransactions(input);
    expect(tx.salary).toEqual([
      {
        SalaryTransaction: {
          EmployeeId: "7",
          SalaryCode: "11",
          Date: "2026-10-01",
          Number: "8",
          Amount: "200",
          TextRow: "Timlön",
        },
      },
      {
        SalaryTransaction: {
          EmployeeId: "7",
          SalaryCode: "310",
          Date: "2026-10-01",
          Number: "1",
          Amount: "192",
          TextRow: "Semesterersättning",
        },
      },
    ]);
    expect(tx.absence).toEqual([
      {
        AbsenceTransaction: {
          EmployeeId: "7",
          CauseCode: "SJK",
          Date: "2026-10-01",
          Hours: 8,
        },
      },
    ]);
  });

  it("reports what is left out", () => {
    const tx = buildFortnoxWageTransactions(input);
    expect(tx.skipped).toEqual(
      expect.arrayContaining([
        {
          userId: "u1",
          name: "Anna",
          code: "mileage_taxfree",
          reason: "no_code",
        },
        { userId: "u2", name: "Bo", code: "*", reason: "no_employee_id" },
        {
          userId: "u1",
          name: "Anna",
          code: "absence_other",
          reason: "unknown_absence_code",
        },
      ]),
    );
  });
});

describe("fortnox-crypto", () => {
  const prev = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret";
  });
  afterAll(() => {
    process.env.JWT_SECRET = prev;
  });

  it("round-trips tokens", () => {
    const enc = encryptToken("abc.def");
    expect(enc).not.toContain("abc");
    expect(decryptToken(enc)).toBe("abc.def");
  });

  it("signs and verifies state, rejecting tampering and expiry", () => {
    const s = signState("c1", "u1");
    expect(verifyState(s)).toMatchObject({ companyId: "c1", userId: "u1" });
    const [body, sig] = s.split(".");
    expect(verifyState(`${body}x.${sig}`)).toBeNull();
    expect(verifyState(s, Date.now() + 60 * 60_000)).toBeNull();
  });
});

describe("supplier invoices from Fortnox", () => {
  const projects = [
    { id: "p1", littera: "P-100", name: "Villa Ek" },
    { id: "p2", littera: "", name: "Badrum Ås" },
  ];

  it("maps a paid supplier invoice and finds the project by littera", () => {
    const doc = mapSupplierInvoice(
      {
        GivenNumber: 17,
        SupplierName: "Ahlsell",
        InvoiceNumber: "A-9",
        InvoiceDate: "2026-10-01",
        DueDate: "2026-10-31",
        FinalPayDate: "2026-10-20",
        Total: "1250",
        VAT: "250",
        Project: "p-100",
      },
      projects,
    );
    expect(doc).toMatchObject({
      fortnoxGivenNumber: "17",
      projectId: "p1",
      supplierName: "Ahlsell",
      total: 1250,
      vat: 250,
      amountExclVat: 1000,
      source: "fortnox",
      status: "paid",
    });
    expect(doc.paidAt.toISOString().slice(0, 10)).toBe("2026-10-20");
  });

  it("falls back to a row's project, then to the project name", () => {
    expect(
      matchProject(
        { SupplierInvoiceRows: [{}, { Project: "Badrum Ås" }] },
        projects,
      ),
    ).toBe("p2");
    expect(matchProject({ Project: "okänd" }, projects)).toBeNull();
    expect(matchProject({}, projects)).toBeNull();
  });
});
