// Avviksrapport / Avvikelserapport: one project's deviations as an A4 PDF
// (rendered by puppeteer, same as the egenkontroll PDF). Bokmål for Norwegian
// companies, Swedish otherwise.
import {
  ExportRow,
  isoDay,
  label,
  LABELS,
  ReportLang,
} from "../deviation.logic";

export type DeviationReportData = {
  lang: ReportLang;
  companyName?: string;
  orgNumber?: string;
  projectName?: string;
  printedAt: Date;
  rows: (ExportRow & { overdue?: boolean })[];
};

function esc(value?: string | number | null): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STATUS_COLORS: Record<string, string> = {
  open: "#dc2626",
  in_progress: "#d97706",
  closed: "#16a34a",
};

export function buildDeviationReportHtml(data: DeviationReportData): string {
  const L = LABELS[data.lang];
  const counts = { open: 0, in_progress: 0, closed: 0, overdue: 0 };
  data.rows.forEach((r) => {
    if (r.status in counts) counts[r.status as keyof typeof counts] += 1;
    if (r.overdue) counts.overdue += 1;
  });
  const orgLabel = data.lang === "nb" ? "Org.nr." : "Org.nr";

  const rows = data.rows
    .map((r) => {
      const detail = [
        r.description ? `<div>${esc(r.description)}</div>` : "",
        r.cause
          ? `<div class="sub"><b>${esc(L.cause)}:</b> ${esc(r.cause)}</div>`
          : "",
        r.correctiveAction
          ? `<div class="sub"><b>${esc(L.correctiveAction)}:</b> ${esc(r.correctiveAction)}</div>`
          : "",
        r.closingComment
          ? `<div class="sub"><b>${esc(L.closingComment)}:</b> ${esc(r.closingComment)}${
              r.closedByName || r.closedAt
                ? ` (${esc([r.closedByName, isoDay(r.closedAt)].filter(Boolean).join(", "))})`
                : ""
            }</div>`
          : "",
      ].join("");
      return `
        <tr>
          <td class="num">${esc(r.number)}</td>
          <td>
            <div class="pt">${esc(r.title)}</div>
            <div class="ref">${esc(label(data.lang, r.category))} · ${esc(label(data.lang, r.severity))}${
              r.location ? ` · ${esc(r.location)}` : ""
            }</div>
            ${detail}
          </td>
          <td class="dt">${esc(r.reportedByName)}<br/>${esc(isoDay(r.reportedAt))}</td>
          <td class="dt">${esc(r.responsibleName) || "—"}<br/><span${
            r.overdue ? ' class="late"' : ""
          }>${esc(isoDay(r.dueDate))}</span></td>
          <td class="res" style="color:${STATUS_COLORS[r.status] || "#334155"}">${esc(
            label(data.lang, r.status),
          )}</td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="${data.lang === "nb" ? "nb" : data.lang}">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #0f172a; margin: 40px; font-size: 12px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 18px; }
  .head h1 { font-size: 20px; margin: 0 0 2px; }
  .head .sub { color: #64748b; font-size: 12px; }
  .company { text-align: right; font-size: 12px; }
  .company .name { font-weight: 600; }
  .meta { display: flex; gap: 24px; margin-bottom: 14px; }
  .meta .label { color: #64748b; margin-right: 6px; }
  .meta .val { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; background: #f1f5f9; padding: 7px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; color: #475569; }
  td { padding: 7px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  td.num { width: 36px; color: #64748b; }
  td.dt { width: 110px; color: #334155; }
  td.res { width: 90px; font-weight: 600; }
  .pt { font-weight: 600; }
  .ref { color: #64748b; font-size: 11px; margin: 2px 0 4px; }
  .sub { margin-top: 3px; color: #334155; }
  .late { color: #dc2626; font-weight: 600; }
  tr { page-break-inside: avoid; }
</style>
</head>
<body>
  <div class="head">
    <div>
      <h1>${esc(L.report)}</h1>
      <div class="sub">${esc(data.projectName) || "—"} · ${esc(L.printed)} ${esc(isoDay(data.printedAt))}</div>
    </div>
    <div class="company">
      <div class="name">${esc(data.companyName)}</div>
      ${data.orgNumber ? `<div>${orgLabel} ${esc(data.orgNumber)}</div>` : ""}
    </div>
  </div>

  <div class="meta">
    <div><span class="label">${esc(L.total)}</span><span class="val">${data.rows.length}</span></div>
    <div><span class="label">${esc(L.open)}</span><span class="val">${counts.open}</span></div>
    <div><span class="label">${esc(L.in_progress)}</span><span class="val">${counts.in_progress}</span></div>
    <div><span class="label">${esc(L.closed)}</span><span class="val">${counts.closed}</span></div>
    <div><span class="label">${esc(L.overdue)}</span><span class="val">${counts.overdue}</span></div>
  </div>

  <table>
    <thead>
      <tr><th>${esc(L.number)}</th><th>${esc(L.deviation)}</th><th>${esc(L.reportedBy)}</th><th>${esc(
        L.responsible,
      )} · ${esc(L.dueDate)}</th><th>${esc(L.status)}</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}
