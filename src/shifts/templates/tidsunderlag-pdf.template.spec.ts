import {
  buildTidsunderlagHtml,
  isoWeek,
  tidsunderlagPageFormat,
  toTidsunderlagDays,
  weekBands,
} from "./tidsunderlag-pdf.template";

describe("tidsunderlag template", () => {
  const days = toTidsunderlagDays([
    "2026-11-13",
    "2026-11-14",
    "2026-11-15",
    "2026-11-16",
  ]);

  it("numbers ISO weeks and marks weekends", () => {
    expect(isoWeek("2026-11-16")).toBe(47);
    expect(days.map((d) => d.we)).toEqual([false, true, true, false]);
    expect(weekBands(days)).toEqual([
      { wk: 46, span: 3 },
      { wk: 47, span: 1 },
    ]);
  });

  it("draws the admin's table: band, rows, Swedish decimals, Total tim", () => {
    const html = buildTidsunderlagHtml({
      title: "Kund AB",
      days,
      groups: [
        {
          label: "Projekt <1>",
          rows: [{ name: "Anna", cells: [8, null, null, 7.5], total: 15.5 }],
          totalHours: 15.5,
        },
      ],
      totalHours: 15.5,
    });
    expect(html).toContain("v46");
    expect(html).toContain("26-11-<wbr>16");
    expect(html).toContain("7,5");
    expect(html).toContain("Projekt &lt;1&gt;");
    expect(html).toContain("Total tim:");
    expect(html).toContain("15,5");
  });

  it("uses A3 for more than 16 days", () => {
    expect(tidsunderlagPageFormat(days)).toBe("A4");
    expect(
      tidsunderlagPageFormat(
        toTidsunderlagDays(
          Array.from({ length: 20 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`),
        ),
      ),
    ).toBe("A3");
  });
});
