import {
  balanceTrans,
  buildSieContent,
  encodeCp437,
  formatSieDate,
  SIE_ACCOUNTS,
} from "./sie.util";
import {
  invoiceToVerification,
  supplierInvoiceToVerification,
} from "./sie.mapper";

const sum = (trans: { amount: number }[]) =>
  // `+ 0` normalises a possible -0 to 0 for strict toBe(0) checks.
  Math.round(trans.reduce((s, t) => s + t.amount, 0) * 100) / 100 + 0;

describe("SIE util", () => {
  it("formats dates to YYYYMMDD from ISO strings and Dates", () => {
    expect(formatSieDate("2026-07-25")).toBe("20260725");
    expect(formatSieDate("2026/07/25")).toBe("20260725");
    expect(formatSieDate(new Date(Date.UTC(2026, 6, 25)))).toBe("20260725");
    expect(formatSieDate("")).toBe("");
  });

  it("balances by pushing the residual onto the rounding account", () => {
    const trans = balanceTrans([
      { account: SIE_ACCOUNTS.ar.n, amount: 1250 },
      { account: SIE_ACCOUNTS.sales.n, amount: -1000 },
      { account: SIE_ACCOUNTS.outVat.n, amount: -250.3 },
    ]);
    expect(sum(trans)).toBe(0);
    const rounding = trans.find((t) => t.account === SIE_ACCOUNTS.rounding.n);
    expect(rounding?.amount).toBeCloseTo(0.3, 2);
  });

  it("drops zero-amount postings", () => {
    const trans = balanceTrans([
      { account: SIE_ACCOUNTS.ar.n, amount: 100 },
      { account: SIE_ACCOUNTS.outVat.n, amount: 0 },
      { account: SIE_ACCOUNTS.sales.n, amount: -100 },
    ]);
    expect(trans).toHaveLength(2);
  });

  it("encodes Swedish characters as CP437 bytes", () => {
    const buf = encodeCp437("Öresavrundning å ä ö");
    expect(buf[0]).toBe(0x99); // Ö
    expect(buf).toContain(0x86); // å
    expect(buf).toContain(0x84); // ä
    expect(buf).toContain(0x94); // ö
  });
});

describe("SIE mapper", () => {
  it("maps a plain invoice to a balanced sales verification", () => {
    const ver = invoiceToVerification({
      invoiceNumber: 1001,
      date: "2026-07-25",
      subtotal: 1000,
      vat: 250,
      total: 1250,
      roundedTotal: 1250,
      rounding: 0,
    });
    expect(ver.series).toBe("F");
    expect(ver.number).toBe(1001);
    expect(ver.date).toBe("20260725");
    expect(sum(ver.trans)).toBe(0);
    const ar = ver.trans.find((t) => t.account === SIE_ACCOUNTS.ar.n);
    expect(ar?.amount).toBe(1250);
    const sales = ver.trans.find((t) => t.account === SIE_ACCOUNTS.sales.n);
    expect(sales?.amount).toBe(-1000);
  });

  it("books ROT to the tax-receivable account and still balances", () => {
    // 30% of 20000 labour = 6000 ROT; customer pays total - ROT.
    const ver = invoiceToVerification({
      invoiceNumber: 1002,
      date: "2026-07-25",
      subtotal: 20000,
      vat: 5000,
      total: 25000,
      rotEnabled: true,
      rotDeduction: 6000,
      roundedTotal: 19000,
      rounding: 0,
    });
    expect(sum(ver.trans)).toBe(0);
    const rot = ver.trans.find((t) => t.account === SIE_ACCOUNTS.rot.n);
    expect(rot?.amount).toBe(6000);
    const ar = ver.trans.find((t) => t.account === SIE_ACCOUNTS.ar.n);
    expect(ar?.amount).toBe(19000);
  });

  it("routes reverse-charge VAT to the reverse sales account with no output VAT", () => {
    const ver = invoiceToVerification({
      invoiceNumber: 1003,
      date: "2026-07-25",
      subtotal: 8000,
      vat: 0,
      total: 8000,
      roundedTotal: 8000,
      reverseVAT: "true",
    });
    expect(sum(ver.trans)).toBe(0);
    expect(
      ver.trans.find((t) => t.account === SIE_ACCOUNTS.salesReverse.n)?.amount,
    ).toBe(-8000);
    expect(
      ver.trans.find((t) => t.account === SIE_ACCOUNTS.outVat.n),
    ).toBeUndefined();
  });

  it("maps a supplier invoice to a balanced purchase verification", () => {
    const ver = supplierInvoiceToVerification(
      {
        invoiceNumber: "A-55",
        invoiceDate: "2026-07-20",
        supplierName: "Beijer",
        amountExclVat: 4000,
        vat: 1000,
        total: 5000,
      },
      1,
    );
    expect(ver.series).toBe("L");
    expect(sum(ver.trans)).toBe(0);
    expect(ver.trans.find((t) => t.account === SIE_ACCOUNTS.ap.n)?.amount).toBe(
      -5000,
    );
    expect(
      ver.trans.find((t) => t.account === SIE_ACCOUNTS.inVat.n)?.amount,
    ).toBe(1000);
  });
});

describe("SIE file", () => {
  it("emits the required header records and only referenced accounts", () => {
    const content = buildSieContent({
      companyName: "Bygg & Co AB",
      orgNumber: "556000-0000",
      generatedDate: "20260728",
      verifications: [
        invoiceToVerification({
          invoiceNumber: 1,
          date: "2026-07-25",
          subtotal: 100,
          vat: 25,
          total: 125,
          roundedTotal: 125,
        }),
      ],
    });
    expect(content).toContain("#FLAGGA 0");
    expect(content).toContain("#SIETYP 4");
    expect(content).toContain("#ORGNR 5560000000");
    expect(content).toContain('#FNAMN "Bygg & Co AB"');
    expect(content).toContain("#KONTO 1510");
    expect(content).toContain('#VER "F" "1" 20260725');
    // The AP account is unused here, so it must not be declared.
    expect(content).not.toContain("#KONTO 2440");
  });
});
