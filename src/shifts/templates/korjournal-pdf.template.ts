import type { KorjournalReport } from "../korjournal";

export type KorjournalPdfData = KorjournalReport & {
  workerName: string;
  companyName: string;
  carRegNumber: string;
  from: string;
  to: string;
  generatedAt: string;
};

export const ESTIMATED_NOTE =
  "* Endast km angivet för dagen — Till och Ärende är projektets adress och namn.";

function esc(value?: string | null): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// Swedish number format: space thousands, comma decimals.
export function svNumber(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("sv-SE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function buildKorjournalHtml(data: KorjournalPdfData): string {
  const showCo2 = data.totalCo2Kg !== null;
  const cols = showCo2 ? 7 : 6;
  const rows = data.rows
    .map(
      (r) => `
      <tr>
        <td class="mono">${esc(r.date)}</td>
        <td>${esc(r.from) || "—"}</td>
        <td>${esc(r.to) || "—"}</td>
        <td>${esc(r.purpose) || "—"}${r.estimated ? " *" : ""}</td>
        <td class="num">${r.odometerStart != null || r.odometerEnd != null ? `${svNumber(r.odometerStart, 0)} – ${svNumber(r.odometerEnd, 0)}` : "—"}</td>
        <td class="num">${svNumber(r.km)}</td>
        ${showCo2 ? `<td class="num">${svNumber(r.co2Kg, 2)}</td>` : ""}
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <title>Körjournal</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: Helvetica, Arial, sans-serif; color: #1b2a3a; font-size: 12px; }
    h1 { font-size: 20px; margin: 0 0 2px; }
    .sub { color: #64748b; font-size: 12px; margin: 0 0 14px; }
    .meta { margin: 0 0 12px; font-size: 12px; }
    .meta b { display: inline-block; min-width: 110px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; border-bottom: 1.5px solid #1b2a3a; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
    td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    tfoot td { font-weight: 700; border-top: 1.5px solid #1b2a3a; border-bottom: none; }
    .num { text-align: right; white-space: nowrap; }
    .mono { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .foot { margin-top: 16px; font-size: 10px; color: #64748b; }
    .empty { text-align: center; color: #64748b; padding: 24px; }
  </style>
</head>
<body>
  <h1>Körjournal</h1>
  <p class="sub">Tjänsteresor med egen bil</p>
  <div class="meta">
    <div><b>Förare</b> ${esc(data.workerName) || "—"}</div>
    <div><b>Företag</b> ${esc(data.companyName) || "—"}</div>
    <div><b>Registreringsnr</b> ${esc(data.carRegNumber) || "—"}</div>
    <div><b>Period</b> ${esc(data.from)} – ${esc(data.to)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Datum</th><th>Från</th><th>Till</th><th>Ärende</th>
        <th class="num">Mätarställning</th><th class="num">Km</th>
        ${showCo2 ? '<th class="num">CO₂ kg</th>' : ""}
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td class="empty" colspan="${cols}">Inga resor för perioden.</td></tr>`}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5">Totalt</td>
        <td class="num">${svNumber(data.totalKm)}</td>
        ${showCo2 ? `<td class="num">${svNumber(data.totalCo2Kg, 2)}</td>` : ""}
      </tr>
    </tfoot>
  </table>
  ${data.rows.some((r) => r.estimated) ? `<p class="foot">${esc(ESTIMATED_NOTE)}</p>` : ""}
  <p class="foot">Kvitton samma dagar: ${svNumber(data.receiptsTotal, 2)} kr. Genererad ${esc(data.generatedAt)}.</p>
</body>
</html>`;
}
