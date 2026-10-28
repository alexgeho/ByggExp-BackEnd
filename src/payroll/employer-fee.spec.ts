import {
  birthYearFromPersonalNumber,
  employerFeeFor,
  EMPLOYER_FEE_GENERAL,
  runPayDate,
} from "./employer-fee";
import { payslipTaxLabel } from "./templates/payslip-pdf.template";

describe("employerFeeFor (Skatteverket 2026)", () => {
  it("uses the general rate when the birth year is unknown", () => {
    expect(employerFeeFor(10000, null, "2026-05-31")).toEqual({
      rate: EMPLOYER_FEE_GENERAL,
      fee: 3142,
    });
  });

  it("general rate for born 1959", () => {
    expect(employerFeeFor(10000, 1959, "2026-05-31").rate).toBe(31.42);
  });

  it("pension-only fee for born 1938–1958 in 2026", () => {
    expect(employerFeeFor(10000, 1958, "2026-05-31")).toEqual({
      rate: 10.21,
      fee: 1021,
    });
    expect(employerFeeFor(10000, 1938, "2026-05-31").rate).toBe(10.21);
  });

  it("no fee for born 1937 or earlier", () => {
    expect(employerFeeFor(10000, 1937, "2026-05-31")).toEqual({
      rate: 0,
      fee: 0,
    });
  });

  it("youth reduction 2003–2007 from April 2026, capped at 25 000 kr", () => {
    expect(employerFeeFor(20000, 2007, "2026-04-30")).toEqual({
      rate: 20.81,
      fee: 4162,
    });
    expect(employerFeeFor(30000, 2003, "2026-04-30").fee).toBe(
      Math.round((25000 * 0.2081 + 5000 * 0.3142) * 100) / 100,
    );
    expect(employerFeeFor(20000, 2002, "2026-04-30").rate).toBe(31.42);
    expect(employerFeeFor(20000, 2008, "2026-04-30").rate).toBe(31.42);
  });

  it("no youth reduction before April 2026 or after September 2027", () => {
    expect(employerFeeFor(20000, 2005, "2026-03-31").rate).toBe(31.42);
    expect(employerFeeFor(20000, 2005, "2027-10-31").rate).toBe(31.42);
  });
});

describe("youth cap across runs in the same month", () => {
  it("only the rest of the 25 000 kr is reduced after earlier pay", () => {
    // 20 000 already paid this month → 5 000 reduced, 15 000 at full rate.
    expect(employerFeeFor(20000, 2005, "2026-05-31", 20000).fee).toBe(
      Math.round((5000 * 0.2081 + 15000 * 0.3142) * 100) / 100,
    );
    // Cap used up → full rate.
    expect(employerFeeFor(10000, 2005, "2026-05-31", 30000).fee).toBe(3142);
  });

  it("two runs together pay the same as one run with the month's pay", () => {
    const a = employerFeeFor(18000, 2004, "2026-06-30").fee;
    const b = employerFeeFor(18000, 2004, "2026-06-30", 18000).fee;
    expect(Math.round((a + b) * 100) / 100).toBe(
      employerFeeFor(36000, 2004, "2026-06-30").fee,
    );
  });

  it("prior pay does not change linear rates", () => {
    expect(employerFeeFor(10000, 1980, "2026-05-31", 50000).fee).toBe(3142);
    expect(employerFeeFor(10000, 1950, "2026-05-31", 50000).fee).toBe(1021);
  });
});

describe("runPayDate", () => {
  it("uses paidAt once paid, else the period end", () => {
    expect(
      runPayDate({
        paidAt: new Date("2026-04-02T10:00:00Z"),
        periodTo: "2026-03-31",
      }),
    ).toBe("2026-04-02");
    expect(runPayDate({ paidAt: null, periodTo: "2026-03-31" })).toBe(
      "2026-03-31",
    );
  });

  it("a March run paid in April gets the youth reduction", () => {
    const pay = runPayDate({
      paidAt: new Date("2026-04-25T10:00:00Z"),
      periodTo: "2026-03-31",
    });
    expect(employerFeeFor(20000, 2005, pay).rate).toBe(20.81);
    expect(employerFeeFor(20000, 2005, "2026-03-31").rate).toBe(31.42);
  });
});

describe("birthYearFromPersonalNumber", () => {
  it("reads 12 and 10 digit numbers", () => {
    expect(birthYearFromPersonalNumber("19580101-1234", "2026-05-31")).toBe(
      1958,
    );
    expect(birthYearFromPersonalNumber("050101-1234", "2026-05-31")).toBe(2005);
    expect(birthYearFromPersonalNumber("200101+1234", "2026-05-31")).toBe(1920);
    expect(birthYearFromPersonalNumber("", "2026-05-31")).toBeNull();
  });
});

describe("payslipTaxLabel", () => {
  it("prints the tax table and column when one was used", () => {
    expect(
      payslipTaxLabel(
        { amount: 30000, tax: 6500, taxTable: 33, taxColumn: 1 },
        30,
      ),
    ).toBe("Preliminär skatt (tabell 33, kolumn 1)");
  });

  it("prints the stored percentage", () => {
    expect(
      payslipTaxLabel({ amount: 10000, tax: 2500, taxPercent: 25 }, 30),
    ).toBe("Preliminär skatt (25,00%)");
  });

  it("older lines: run % only when it matches the withheld amount", () => {
    expect(payslipTaxLabel({ amount: 10000, tax: 3000 }, 30)).toBe(
      "Preliminär skatt (30,00%)",
    );
    expect(payslipTaxLabel({ amount: 10000, tax: 2100 }, 30)).toBe(
      "Preliminär skatt",
    );
  });
});
