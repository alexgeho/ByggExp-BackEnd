import {
  buildHoursGridHtml,
  hoursGridPageFormat,
} from "./hours-grid-pdf.template";

describe("hours grid template (admin «Timmar» PDF)", () => {
  const html = buildHoursGridHtml({
    project: "Brf <Solgläntan>",
    title: "Timmar · 2026-11-06 - 2026-11-09",
    subtitle: "Manuellt",
    totalLabel: "Totalt (Manuellt)",
    dates: ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"],
    rows: [{ name: "Ingus Zarins", cells: [8, 0, 0, 7.5], total: 15.5 }],
  });

  it("puts the project name on top", () => {
    expect(html).toContain('<div class="project">Brf &lt;Solgläntan&gt;</div>');
  });

  it("writes empty days as 0, never blank", () => {
    expect(html).toContain(
      "<td>8</td><td>0</td><td>0</td><td>7,5</td><td>15,5</td>",
    );
  });

  it("has week bands, day numbers, Dagssumma and Totalt", () => {
    expect(html).toContain("Vecka 45");
    expect(html).toContain("Vecka 46");
    expect(html).toContain("<th>6</th><th>7</th>");
    expect(html).toContain("Dagssumma");
    expect(html).toContain("Totalt (Manuellt)");
  });

  it("uses A3 only for long periods", () => {
    expect(hoursGridPageFormat(Array(14).fill("x"))).toBe("A4");
    expect(hoursGridPageFormat(Array(31).fill("x"))).toBe("A3");
  });
});
