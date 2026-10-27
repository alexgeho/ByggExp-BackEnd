import { encodeCp437 } from "./sie.util";
import {
  decodeSie,
  ledgerBalances,
  parseSie,
  sieProblems,
  tokenize,
} from "./sie.import";

const file = [
  "#FLAGGA 0",
  "#FORMAT PC8",
  '#FNAMN "Bygg & Söner AB"',
  "#ORGNR 556677-8899",
  "#RAR 0 20260101 20261231",
  "#RAR -1 20250101 20251231",
  '#KONTO 1930 "Företagskonto"',
  '#KONTO 3001 "Försäljning"',
  '#KONTO 2610 "Utgående moms"',
  "#IB 0 1930 1000.50",
  "#IB -1 1930 200",
  "#UB 0 1930 2250.50",
  '#VER A 1 20260115 "Kundfaktura \\"12\\"" 20260116',
  "{",
  '   #TRANS 1930 {} 1250 "" "Bank" 0',
  '   #TRANS 3001 {1 "P1"} -1000',
  "   #RTRANS 2610 {} -250",
  "   #TRANS 2610 {} -250",
  "   #BTRANS 2610 {} -999",
  "}",
  "",
].join("\r\n");

describe("SIE4 import", () => {
  it("tokenizes quotes, escapes and object lists", () => {
    expect(tokenize('#TRANS 3001 {1 "P1"} -1000 "" "a b"')).toEqual([
      "#TRANS",
      "3001",
      '{1 "P1"}',
      "-1000",
      "",
      "a b",
    ]);
  });

  it("decodes CP437 (PC8) round-trip", () => {
    expect(decodeSie(encodeCp437("Företagskonto ÅÄÖ"))).toBe(
      "Företagskonto ÅÄÖ",
    );
  });

  it("reads the current year only and skips RTRANS/BTRANS", () => {
    const sie = parseSie(decodeSie(encodeCp437(file)));
    expect(sie.companyName).toBe("Bygg & Söner AB");
    expect(sie.start).toBe("2026-01-01");
    expect(sie.end).toBe("2026-12-31");
    expect(sie.accounts).toHaveLength(3);
    expect(sie.ib).toEqual([{ account: 1930, amount: 1000.5 }]);
    expect(sie.verifications).toHaveLength(1);
    const v = sie.verifications[0];
    expect(v).toMatchObject({
      series: "A",
      number: "1",
      date: "2026-01-15",
      text: 'Kundfaktura "12"',
    });
    expect(v.trans).toEqual([
      { account: 1930, amount: 1250, text: "Bank" },
      { account: 3001, amount: -1000 },
      { account: 2610, amount: -250 },
    ]);
    expect(sieProblems(sie)).toEqual([]);
  });

  it("balances = IB + movements and match the file's UB", () => {
    const sie = parseSie(file);
    const rows = ledgerBalances(sie.accounts, sie.ib, sie.verifications);
    const bank = rows.find((r) => r.account === 1930);
    expect(bank).toMatchObject({ ib: 1000.5, change: 1250, ub: 2250.5 });
    expect(bank?.ub).toBe(sie.ub[0].amount);
    expect(rows.find((r) => r.account === 3001)?.ub).toBe(-1000);
  });

  it("flags a missing year and unbalanced verifications", () => {
    const sie = parseSie('#VER A 1 20260101 ""\n{\n#TRANS 1930 {} 10\n}\n');
    expect(sieProblems(sie)).toEqual(["year", "unbalanced:A1"]);
  });
});
