// Tidsunderlag — the hours behind an invoice: who worked which day. Same table
// as the web admin's «Tidsunderlag» (byggexp-admin timesheetPdf.js): week bands
// above the days, one row per worker, weekends grey, green project band and a
// green «Total tim» cell. The app downloads it from /shifts/export.

export type TidsunderlagDay = { date: string; wk: number; we: boolean };

export type TidsunderlagGroup = {
  label: string;
  name?: string;
  rows: Array<{ name: string; cells: Array<number | null>; total: number }>;
  totalHours: number;
};

export type TidsunderlagData = {
  title: string;
  days: TidsunderlagDay[];
  groups: TidsunderlagGroup[];
  totalHours: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const svNum = (n: number) => String(round2(n)).replace(".", ",");

function esc(value?: string | null): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// ISO week number of a YYYY-MM-DD date.
export function isoWeek(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
}

export function toTidsunderlagDays(dates: string[]): TidsunderlagDay[] {
  return dates.map((date) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return { date, wk: isoWeek(date), we: weekday === 0 || weekday === 6 };
  });
}

// Consecutive days of one ISO week → one band above them ("v43").
export function weekBands(days: TidsunderlagDay[]) {
  const bands: Array<{ wk: number; span: number }> = [];
  for (const day of days) {
    const last = bands[bands.length - 1];
    if (last && last.wk === day.wk) last.span += 1;
    else bands.push({ wk: day.wk, span: 1 });
  }
  return bands;
}

// A3 for long periods, as in the admin (more than 16 day columns).
export function tidsunderlagPageFormat(days: TidsunderlagDay[]) {
  return days.length > 16 ? "A3" : "A4";
}

export function buildTidsunderlagHtml(data: TidsunderlagData): string {
  const { days } = data;
  const cols = days.length + 1;
  const dayCell = (value: number | null, day: TidsunderlagDay) =>
    `<td class="${day.we ? "we" : ""}">${value == null ? "-" : svNum(value)}</td>`;

  const totalLine = (label: string, value: string) => {
    const labelSpan = Math.min(2, Math.max(1, cols - 1));
    const lead = cols - 1 - labelSpan;
    return `<tr>${lead > 0 ? `<td colspan="${lead}" class="blank"></td>` : ""}<td colspan="${labelSpan}" class="green right">${esc(label)}</td><td class="green right">${esc(value)}</td></tr>`;
  };

  const groups = data.groups
    .map(
      (group) =>
        (group.label
          ? `<tr><td colspan="${cols}" class="green left bold">${esc(group.label)}</td></tr>`
          : "") +
        group.rows
          .map(
            (row) =>
              `<tr><td class="left">${esc(row.name)}</td>${row.cells
                .map((value, i) => dayCell(value, days[i]))
                .join("")}</tr>`,
          )
          .join("") +
        (data.groups.length > 1
          ? totalLine("Total tim:", svNum(group.totalHours))
          : ""),
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: ${tidsunderlagPageFormat(days)} landscape; margin: 14mm 14mm 12mm; }
  body { margin: 0; font-family: Helvetica, Arial, sans-serif; color: #141414; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  td, th { border: 0.3mm solid #c8c8c8; padding: 1.4mm 0.6mm; font-size: 8.5pt; text-align: center; font-weight: normal; overflow: hidden; white-space: nowrap; }
  col.name { width: 46mm; }
  th.date { white-space: normal; line-height: 1.25; }
  .title { font-weight: bold; font-size: 10pt; white-space: normal; }
  .wk { font-size: 11pt; }
  .left { text-align: left; padding-left: 1.6mm; }
  .right { text-align: right; padding-right: 1.6mm; }
  .bold { font-weight: bold; }
  .we { background: #eeeeee; }
  .green { background: #d9ead3; }
  .blank { border: 0.3mm solid #c8c8c8; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
</style></head><body>
<table>
  <colgroup><col class="name">${days.map(() => "<col>").join("")}</colgroup>
  <thead>
    <tr><th rowspan="2" class="title">${esc(data.title)}</th>${weekBands(days)
      .map((band) => `<th colspan="${band.span}" class="wk">v${band.wk}</th>`)
      .join("")}</tr>
    <tr>${days.map((day) => `<th class="date">${esc(day.date.slice(2, 8))}<wbr>${esc(day.date.slice(8))}</th>`).join("")}</tr>
  </thead>
  <tbody>
    ${groups}
    ${totalLine("Total tim:", svNum(data.totalHours))}
  </tbody>
</table>
</body></html>`;
}
