import {
  lookupTax,
  parseTaxTableFile,
  validateTaxTables,
} from "./tax-table-file";
import { findMonthlyFileUrl } from "./tax-table.service";
import { excerpt, textHash, visibleText } from "./rule-watch.util";
import {
  WageRuleSet,
  buildWorkerWageBasis,
  proposeRaisedRate,
  rateOn,
} from "./wage-basis";
import { latestRate } from "./wage-history";

// Real rows from Skatteverket's 2026 monthly file (allmanna-tabeller-manad.txt).
const SKV_SAMPLE = [
  "﻿30B29      1   2000    0    0    0    0    0    0",
  "30B29   2001   2100  150    0  150    0  150    2",
  "30B31  30001  30200 5575 5445 2419 5575 8617 8617",
  "30B31  30201  30400 5622 5490 2429 5622 8684 8684",
  "30%42 7966011045800   60   60   60   50   61   61",
  "30%421327801          61   61   61   51   61   61",
].join("\r\n");

describe("Skatteverket tax table file", () => {
  const rows = parseTaxTableFile(SKV_SAMPLE);

  it("parses kronor and percent rows, including open-ended brackets", () => {
    expect(rows).toHaveLength(6);
    expect(rows[2]).toEqual({
      table: 31,
      from: 30001,
      to: 30200,
      percent: false,
      columns: [5575, 5445, 2419, 5575, 8617, 8617],
    });
    expect(rows[4]).toMatchObject({
      table: 42,
      from: 796601,
      to: 1045800,
      percent: true,
    });
    expect(rows[5]).toMatchObject({
      table: 42,
      from: 1327801,
      to: null,
      percent: true,
    });
    expect(rows[5].columns).toEqual([61, 61, 61, 51, 61, 61]);
  });

  it("looks up tax in kronor, and as a percent of the whole income above the top bracket", () => {
    expect(lookupTax(rows, 31, 1, 30100)).toBe(5575);
    expect(lookupTax(rows, 31, 3, 30300)).toBe(2429);
    expect(lookupTax(rows, 42, 4, 1500000)).toBe(765000); // 51 %
    expect(lookupTax(rows, 33, 1, 30100)).toBeNull(); // table not loaded
    expect(lookupTax(rows, 31, 7, 30100)).toBeNull(); // no column 7
  });

  it("rejects an incomplete file", () => {
    const problems = validateTaxTables(rows);
    expect(problems.some((p) => p.startsWith("Only"))).toBe(true);
    expect(problems).toContain("Table 30 is missing");
  });

  it("throws on a garbled row instead of guessing", () => {
    expect(() =>
      parseTaxTableFile("30B31  3000X  30200 5575 5445 2419 5575 8617 8617"),
    ).toThrow();
  });

  it("finds the year's monthly file link on Skatteverket's page", () => {
    const html = `
      <h2>2026</h2><ul><li><a href="/download/18.aaa/1/allmanna-tabeller-manad.txt">Månadslön txt</a></li></ul>
      <h2>2025</h2><ul><li><a href="/download/18.bbb/2/allmanna-tabeller-manad.txt">Månadslön txt</a></li></ul>`;
    expect(findMonthlyFileUrl(html, 2026)).toBe(
      "https://www.skatteverket.se/download/18.aaa/1/allmanna-tabeller-manad.txt",
    );
    expect(findMonthlyFileUrl(html, 2025)).toBe(
      "https://www.skatteverket.se/download/18.bbb/2/allmanna-tabeller-manad.txt",
    );
    expect(findMonthlyFileUrl(html, 2027)).toBeNull();
  });
});

describe("rule watch text", () => {
  it("ignores scripts, styles and markup when deciding whether a page changed", () => {
    const a = "<html><script>var t=1</script><p>Lön 7,54 kr</p></html>";
    const b =
      "<html><script>var t=2</script><div><p>Lön   7,54 kr</p></div></html>";
    expect(visibleText(a)).toBe("Lön 7,54 kr");
    expect(textHash(visibleText(a))).toBe(textHash(visibleText(b)));
    expect(textHash(visibleText("<p>Lön 6,85 kr</p>"))).not.toBe(
      textHash(visibleText(a)),
    );
    expect(excerpt("x".repeat(100), 10)).toHaveLength(10);
  });
});

describe("wage history and agreement raises", () => {
  const rules: WageRuleSet = {
    id: "r26",
    name: "Byggavtalet 2026",
    validFrom: "2026-05-01",
    validTo: "",
    minimumWages: [{ category: "yrkesarbetare", hourly: 200 }],
    hourTypeSupplements: [],
    vacationPayPercent: null,
    mileageRatePerKm: 0,
    mileageTaxFreePerKm: 0,
    travelTimeRatePerHour: 0,
    perDiemFull: 0,
    perDiemHalf: 0,
    perDiemTaxFreeFull: 0,
    perDiemTaxFreeHalf: 0,
    atkPercent: null,
    wageRaiseKind: "fixed",
    wageRaiseValue: 6.85,
  };

  const worker = {
    userId: "u1",
    name: "Anna",
    hourlyRate: 256.85,
    wageCategory: "yrkesarbetare",
    rates: [
      { validFrom: "2000-01-01", hourlyRate: 250 },
      { validFrom: "2026-05-01", hourlyRate: 256.85 },
    ],
  };

  it("pays each day at the wage in force that day", () => {
    expect(rateOn(worker, "2026-04-30")).toBe(250);
    expect(rateOn(worker, "2026-05-01")).toBe(256.85);
    expect(rateOn({ ...worker, rates: [] }, "2026-04-30")).toBe(256.85);
    expect(latestRate(worker.rates, "1999-12-31")).toBeNull();

    const b = buildWorkerWageBasis(
      worker,
      [
        { shiftDate: "2026-04-30", hours: 8 },
        { shiftDate: "2026-05-04", hours: 8 },
      ],
      [],
      [rules],
      { from: "2026-04-27", to: "2026-05-08" },
    );
    const hours = b.items.filter((i) => i.code === "hours_normal");
    expect(hours.map((i) => i.amount)).toEqual([2000, 2054.8]);
    expect(b.hourlyRate).toBe(256.85);
  });

  it("proposes old wage + raise, never below the new minimum", () => {
    expect(proposeRaisedRate(250, rules, "yrkesarbetare")).toBe(256.85);
    expect(proposeRaisedRate(190, rules, "yrkesarbetare")).toBe(200);
    expect(
      proposeRaisedRate(
        250,
        { ...rules, wageRaiseKind: "percent", wageRaiseValue: 3 },
        "larling",
      ),
    ).toBe(257.5);
  });
});
