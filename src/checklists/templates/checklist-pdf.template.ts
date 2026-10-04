export type ChecklistPdfItem = {
  text?: string;
  reference?: string;
  result?: string;
  comment?: string;
  date?: string;
  method?: string;
  measuredValue?: string;
  unit?: string;
  checkedByName?: string;
  action?: string;
  actionDoneAt?: string;
  photos?: string[]; // data URIs
};

export type ChecklistPdfData = {
  companyName?: string;
  orgNumber?: string;
  projectName?: string;
  title?: string;
  categoryLabel?: string;
  date?: string;
  responsible?: string;
  notes?: string;
  // Intyg om Säker Vatteninstallation header (VVS only).
  tradeInfo?: { scope?: string; part?: string; rulesVersion?: string } | null;
  trade?: string;
  items: ChecklistPdfItem[];
  signedByName?: string;
  signedAt?: string;
};

function esc(value?: string | number | null): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const RESULT_LABELS: Record<string, string> = {
  ok: "Godkänd",
  remark: "Anmärkning",
  na: "Ej aktuellt",
  pending: "—",
};

const RESULT_COLORS: Record<string, string> = {
  ok: "#16a34a",
  remark: "#dc2626",
  na: "#64748b",
  pending: "#94a3b8",
};

export function buildChecklistHtml(data: ChecklistPdfData): string {
  const items = data.items || [];
  // Optional columns only when some point uses them.
  const hasMethod = items.some((it) => it.method);
  const hasValue = items.some((it) => it.measuredValue);
  const rows = items
    .map((item, i) => {
      const result = item.result || "pending";
      const value = item.measuredValue
        ? `${item.measuredValue}${item.unit ? ` ${item.unit}` : ""}`
        : "";
      const action = item.action
        ? `<div class="act">Åtgärd: ${esc(item.action)}${
            item.actionDoneAt ? ` · ${esc(item.actionDoneAt)}` : ""
          }</div>`
        : "";
      return `
        <tr>
          <td class="num">${i + 1}</td>
          <td>
            <div class="pt">${esc(item.text)}</div>
            ${item.reference ? `<div class="ref">${esc(item.reference)}</div>` : ""}
          </td>
          ${hasMethod ? `<td class="mt">${esc(item.method)}</td>` : ""}
          ${hasValue ? `<td class="mv">${esc(value)}</td>` : ""}
          <td class="res" style="color:${RESULT_COLORS[result] || "#334155"}">
            ${esc(RESULT_LABELS[result] || result)}
          </td>
          <td class="dt">${esc(item.checkedByName)}${
            item.checkedByName && item.date ? "<br/>" : ""
          }${esc(item.date)}</td>
          <td class="cmt">${esc(item.comment)}${action}${
            item.photos?.length
              ? `<div class="ph">${item.photos.map((src) => `<img src="${src}" />`).join("")}</div>`
              : ""
          }</td>
        </tr>`;
    })
    .join("");

  // Avvikelser without a completed åtgärd.
  const open = items
    .map((it, i) => ({ it, n: i + 1 }))
    .filter(({ it }) => it.result === "remark" && !it.actionDoneAt);
  const openHtml = open.length
    ? `<div class="notes"><div class="label">Öppna avvikelser</div>${open
        .map(
          ({ it, n }) =>
            `<div>${n}. ${esc(it.text)}${it.comment ? ` — ${esc(it.comment)}` : ""}${
              it.action ? ` · Åtgärd: ${esc(it.action)}` : ""
            }</div>`,
        )
        .join("")}</div>`
    : "";

  const ti = data.trade === "vvs" ? data.tradeInfo : null;
  const intyg = ti
    ? `<div class="intyg">
        <div class="label">Intyg om Säker Vatteninstallation</div>
        <div class="meta">
          <div class="row"><span class="label">Omfattning</span><span class="val">${esc(ti.scope) || "—"}</span></div>
          <div class="row"><span class="label">Byggnad/del</span><span class="val">${esc(ti.part) || "—"}</span></div>
          <div class="row"><span class="label">Branschregler</span><span class="val">Säker Vatten ${esc(ti.rulesVersion) || "—"}</span></div>
        </div>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="sv">
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
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 18px; }
  .meta .row { display: flex; gap: 8px; }
  .meta .label { color: #64748b; min-width: 90px; }
  .meta .val { font-weight: 500; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { text-align: left; background: #f1f5f9; padding: 7px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; color: #475569; }
  td { padding: 7px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  td.num { width: 28px; color: #94a3b8; }
  td.res { width: 90px; font-weight: 600; }
  td.cmt { width: 30%; color: #334155; }
  td.dt { width: 96px; color: #334155; }
  td.mt { width: 80px; color: #334155; }
  td.mv { width: 64px; color: #334155; white-space: nowrap; }
  .act { margin-top: 4px; color: #0f172a; }
  .intyg { margin-bottom: 18px; }
  .intyg > .label { font-weight: 600; margin-bottom: 6px; }
  .ph { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .ph img { width: 72px; height: 72px; object-fit: cover; border-radius: 3px; }
  tr { page-break-inside: avoid; }
  .pt { font-weight: 500; }
  .ref { color: #94a3b8; font-size: 11px; margin-top: 2px; }
  .notes { margin-top: 18px; }
  .notes .label { color: #64748b; margin-bottom: 4px; }
  .sign { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; }
  .sign .line { border-top: 1px solid #0f172a; padding-top: 6px; width: 260px; }
  .sign .muted { color: #64748b; font-size: 11px; }
</style>
</head>
<body>
  <div class="head">
    <div>
      <h1>Egenkontroll</h1>
      <div class="sub">${esc(data.title)}${data.categoryLabel ? ` · ${esc(data.categoryLabel)}` : ""}</div>
    </div>
    <div class="company">
      <div class="name">${esc(data.companyName)}</div>
      ${data.orgNumber ? `<div>Org.nr ${esc(data.orgNumber)}</div>` : ""}
    </div>
  </div>

  <div class="meta">
    <div class="row"><span class="label">Projekt</span><span class="val">${esc(data.projectName) || "—"}</span></div>
    <div class="row"><span class="label">Datum</span><span class="val">${esc(data.date) || "—"}</span></div>
    <div class="row"><span class="label">Ansvarig</span><span class="val">${esc(data.responsible) || "—"}</span></div>
    <div class="row"><span class="label">Kategori</span><span class="val">${esc(data.categoryLabel) || "—"}</span></div>
  </div>

  ${intyg}

  <table>
    <thead>
      <tr><th>#</th><th>Kontrollpunkt</th>${hasMethod ? "<th>Metod</th>" : ""}${
        hasValue ? "<th>Mätvärde</th>" : ""
      }<th>Resultat</th><th>Kontrollerad av</th><th>Kommentar</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  ${openHtml}

  ${
    data.notes
      ? `<div class="notes"><div class="label">Övriga noteringar</div><div>${esc(data.notes)}</div></div>`
      : ""
  }

  <div class="sign">
    <div class="line">
      <div>${esc(data.signedByName) || "&nbsp;"}</div>
      <div class="muted">Underskrift${data.signedAt ? ` · ${esc(data.signedAt)}` : ""}</div>
    </div>
  </div>
</body>
</html>`;
}
