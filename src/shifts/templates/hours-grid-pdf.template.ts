// «Timmar» — the same table the web admin downloads from Hours → PDF
// (byggexp-admin hoursExport.js exportHoursPdf): project name on top, then
// «Timmar · period» and the hours source, a week band above the day numbers,
// one row per worker, a «Dagssumma» row and a «Totalt (source)» column.
// Empty days are written as 0 (owner 19.11). The app downloads it from
// /shifts/export?format=pdf so the phone gives the same file as the computer.

import { toTidsunderlagDays, weekBands } from "./tidsunderlag-pdf.template";

export type HoursGridData = {
  project: string;
  title: string;
  subtitle: string;
  totalLabel: string;
  dates: string[];
  rows: Array<{ name: string; cells: number[]; total: number }>;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const svNum = (n: number) => String(round2(n || 0)).replace(".", ",");

function esc(value?: string | null): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function hoursGridPageFormat(dates: string[]) {
  return dates.length > 20 ? "A3" : "A4";
}

export function buildHoursGridHtml(data: HoursGridData): string {
  const days = toTidsunderlagDays(data.dates);
  const dailyTotals = data.dates.map((_, i) =>
    round2(data.rows.reduce((sum, row) => sum + (row.cells[i] || 0), 0)),
  );
  const grandTotal = round2(data.rows.reduce((sum, row) => sum + row.total, 0));

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: ${hoursGridPageFormat(data.dates)} landscape; margin: 10mm 14mm; }
  body { margin: 0; font-family: Helvetica, Arial, sans-serif; color: #141414; }
  .project { font-size: 15pt; font-weight: bold; margin: 0 0 1.5mm; }
  .title { font-size: 12pt; margin: 0 0 1mm; }
  .subtitle { font-size: 9pt; color: #787878; margin: 0 0 3mm; }
  table { border-collapse: collapse; width: 100%; }
  th, td { font-size: 9pt; padding: 1.6mm 1mm; text-align: center; white-space: nowrap; }
  .band th { background: #f0f4fa; color: #141414; font-weight: bold; }
  .head th { background: #2683f9; color: #fff; font-weight: bold; }
  tbody td { border: 0.25mm solid #c8c8c8; color: #505050; }
  tbody td.name { text-align: left; }
  tfoot td { background: #f0f4fa; font-weight: bold; }
  col.name { width: 34mm; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
</style></head><body>
${data.project ? `<div class="project">${esc(data.project)}</div>` : ""}
<div class="title">${esc(data.title)}</div>
${data.subtitle ? `<div class="subtitle">${esc(data.subtitle)}</div>` : ""}
<table>
  <colgroup><col class="name">${days.map(() => "<col>").join("")}<col></colgroup>
  <thead>
    <tr class="band"><th></th>${weekBands(days)
      .map((band) => `<th colspan="${band.span}">Vecka ${band.wk}</th>`)
      .join("")}<th></th></tr>
    <tr class="head"><th>Anställd</th>${days
      .map((day) => `<th>${Number(day.date.slice(8))}</th>`)
      .join("")}<th>${esc(data.totalLabel)}</th></tr>
  </thead>
  <tbody>
    ${data.rows
      .map(
        (row) =>
          `<tr><td class="name">${esc(row.name)}</td>${row.cells
            .map((value) => `<td>${svNum(value)}</td>`)
            .join("")}<td>${svNum(row.total)}</td></tr>`,
      )
      .join("")}
  </tbody>
  <tfoot>
    <tr><td>Dagssumma</td>${dailyTotals
      .map((value) => `<td>${svNum(value)}</td>`)
      .join("")}<td>${svNum(grandTotal)}</td></tr>
  </tfoot>
</table>
</body></html>`;
}
