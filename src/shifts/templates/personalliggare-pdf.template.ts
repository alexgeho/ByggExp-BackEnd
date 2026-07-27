export type PersonalliggareRow = {
  date?: string;
  workerName?: string;
  personalNumber?: string;
  companyName?: string;
  orgNumber?: string;
  checkIn?: string;
  checkOut?: string;
};

export type PersonalliggareData = {
  projectName?: string;
  location?: string;
  from?: string;
  to?: string;
  generatedAt?: string;
  rows: PersonalliggareRow[];
};

function esc(value?: string | null): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function buildPersonalliggareHtml(data: PersonalliggareData): string {
  const rows = (data.rows || [])
    .map(
      (r) => `
      <tr>
        <td>${esc(r.date)}</td>
        <td>${esc(r.workerName)}</td>
        <td class="mono">${esc(r.personalNumber) || "—"}</td>
        <td>${esc(r.companyName)}${r.orgNumber ? `<br><span class="muted">${esc(r.orgNumber)}</span>` : ""}</td>
        <td class="num">${esc(r.checkIn)}</td>
        <td class="num">${esc(r.checkOut) || "—"}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <title>Personalliggare</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: Helvetica, Arial, sans-serif; color: #1b2a3a; font-size: 12px; }
    h1 { font-size: 20px; margin: 0 0 2px; }
    .sub { color: #64748b; font-size: 12px; margin: 0 0 14px; }
    .meta { margin: 0 0 12px; font-size: 12px; }
    .meta b { display: inline-block; min-width: 90px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; border-bottom: 1.5px solid #1b2a3a; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
    td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    .num { text-align: right; white-space: nowrap; }
    .mono { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .muted { color: #64748b; font-size: 10px; }
    .foot { margin-top: 16px; font-size: 10px; color: #64748b; }
    .empty { text-align: center; color: #64748b; padding: 24px; }
  </style>
</head>
<body>
  <h1>Personalliggare</h1>
  <p class="sub">Elektronisk personalliggare enligt Skatteverkets krav</p>
  <div class="meta">
    <div><b>Arbetsplats</b> ${esc(data.projectName) || "—"}</div>
    <div><b>Adress</b> ${esc(data.location) || "—"}</div>
    <div><b>Period</b> ${esc(data.from)} – ${esc(data.to)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Datum</th><th>Namn</th><th>Personnummer</th><th>Företag</th>
        <th class="num">In</th><th class="num">Ut</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td class="empty" colspan="6">Inga registreringar för perioden.</td></tr>'}
    </tbody>
  </table>
  <p class="foot">Genererad ${esc(data.generatedAt)}. In-/uttider kommer från arbetspassens registreringar.</p>
</body>
</html>`;
}
