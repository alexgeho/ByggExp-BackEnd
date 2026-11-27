import { buildKorjournalHtml, svNumber } from "./korjournal-pdf.template";

const base = {
  workerName: "Anna <A>",
  companyName: "Bygg AB",
  carRegNumber: "ABC123",
  from: "2026-11-01",
  to: "2026-11-30",
  generatedAt: "2026-11-27 20:00",
  receiptsTotal: 1234.5,
};

describe("körjournal PDF", () => {
  it("lists trips, escapes text, shows totals", () => {
    const html = buildKorjournalHtml({
      ...base,
      rows: [
        {
          date: "2026-11-03",
          from: "Hem",
          to: "Ekvägen 1",
          purpose: "Villa Ek",
          km: 12.5,
          odometerStart: 1000,
          odometerEnd: 1012,
          co2Kg: 1.5,
        },
      ],
      totalKm: 12.5,
      totalCo2Kg: 1.5,
    });
    expect(html).toContain("Anna &lt;A&gt;");
    expect(html).toContain("Ekvägen 1");
    expect(html).toContain("12,5");
    expect(html).toContain("CO₂ kg");
    expect(html).toContain("ABC123");
  });

  it("hides the CO2 column without g/km and says when empty", () => {
    const html = buildKorjournalHtml({
      ...base,
      rows: [],
      totalKm: 0,
      totalCo2Kg: null,
    });
    expect(html).not.toContain("CO₂ kg");
    expect(html).toContain("Inga resor för perioden.");
  });

  it("formats numbers the Swedish way", () => {
    expect(svNumber(null)).toBe("—");
    expect(svNumber(1.25, 2)).toBe("1,25");
  });
});
