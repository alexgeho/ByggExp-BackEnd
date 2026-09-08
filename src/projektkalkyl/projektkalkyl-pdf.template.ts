// Server-side HTML for the Projektkalkyl PDF (rendered by puppeteer, reusing the
// invoice PDF launcher). Mirrors the read-only board. Self-contained math.

const VAT_RATE = 0.25;
const COLORS: Record<string, { bg: string; head: string }> = {
  yellow: { bg: "#fdf6dd", head: "#f6e9a8" },
  green: { bg: "#e4efdd", head: "#cfe3c1" },
  blue: { bg: "#dde6f4", head: "#c3d3ec" },
  purple: { bg: "#e9e3f4", head: "#d6c9ec" },
  orange: { bg: "#fce7d6", head: "#f6ceac" },
  grey: { bg: "#eef1f5", head: "#dbe1ea" },
};

type Cell = string | number;
interface Column { id: string; label: string; type: string }
interface Row { id: string; cells: Record<string, Cell> }
interface Table {
  id: string; side: string; title: string; color: string; vatMode: string;
  markupPct?: number; contingencyPct?: number; columns: Column[]; rows: Row[];
}
interface Calc { name?: string; note?: string; tables?: unknown[] }

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const money = (n: number) =>
  `${Math.round(n).toLocaleString("sv-SE").replace(/ /g, " ")} kr`;

function lineAmount(table: Table, row: Row): number {
  const cols = table.columns || [];
  const qty = cols.find((c) => c.type === "qty");
  const price = cols.find((c) => c.type === "price");
  if (qty && price) {
    return (Number(row.cells?.[qty.id]) || 0) * (Number(row.cells?.[price.id]) || 0);
  }
  const amt = cols.find((c) => c.type === "amount");
  return amt ? Number(row.cells?.[amt.id]) || 0 : 0;
}

function tableTotals(table: Table) {
  let base = 0;
  for (const r of table.rows || []) base += lineAmount(table, r);
  const markup = base * ((table.markupPct || 0) / 100);
  const contingency = (base + markup) * ((table.contingencyPct || 0) / 100);
  const netto = base + markup + contingency;
  const vat = table.vatMode === "inkl25" ? netto * VAT_RATE : 0;
  return { base, markup, contingency, netto, vat, brutto: netto + vat };
}

function sideTotals(tables: Table[], side: string) {
  let netto = 0;
  let vat = 0;
  for (const t of tables.filter((x) => x.side === side)) {
    const tt = tableTotals(t);
    netto += tt.netto;
    vat += tt.vat;
  }
  return { netto, vat, brutto: netto + vat };
}

function renderTable(t: Table): string {
  const p = COLORS[t.color] || COLORS.grey;
  const tt = tableTotals(t);
  const cols = t.columns || [];
  const head = cols
    .map((c) => `<th style="text-align:${c.type === "amount" ? "right" : "left"}">${esc(c.label)}</th>`)
    .join("");
  const body = (t.rows || [])
    .map((r) => `<tr>${cols
      .map((c) => {
        const isNum = c.type === "amount" || c.type === "qty" || c.type === "price";
        const val = c.type === "amount"
          ? money(lineAmount(t, r))
          : (isNum ? (Number(r.cells?.[c.id]) || 0).toLocaleString("sv-SE") : esc(r.cells?.[c.id]));
        return `<td style="text-align:${isNum ? "right" : "left"}">${val}</td>`;
      })
      .join("")}</tr>`)
    .join("");
  const extra = [
    t.markupPct ? `<div>Påslag ${t.markupPct}%: ${money(tt.markup)}</div>` : "",
    t.contingencyPct ? `<div>Reserv ${t.contingencyPct}%: ${money(tt.contingency)}</div>` : "",
  ].join("");
  return `
    <div class="tbl" style="background:${p.bg}">
      <div class="tbl-head" style="background:${p.head}">
        <span>${esc(t.title)}</span>
        <span class="vat">${t.vatMode === "inkl25" ? "Med moms 25%" : "Utan moms"}</span>
      </div>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      <div class="sub">${extra}<b>${money(tt.brutto)}</b></div>
    </div>`;
}

export function buildProjektkalkylHtml(calc: Calc): string {
  const tables = (calc.tables || []) as Table[];
  const inc = sideTotals(tables, "income");
  const exp = sideTotals(tables, "expense");
  const profit = inc.brutto - exp.brutto;
  const col = (side: string, label: string, tot: { brutto: number }, color: string) => `
    <div class="col">
      <h3>${label}</h3>
      ${tables.filter((t) => t.side === side).map(renderTable).join("")}
      <div class="total" style="background:${color}">TOTAL <b>${money(tot.brutto)}</b></div>
    </div>`;
  return `<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"/><style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color:#0b1f3a; margin:0; padding:24px; font-size:12px; }
    h1 { font-size:22px; margin:0 0 4px; }
    .sub-h { color:#5a6b7d; margin:0 0 16px; }
    .cols { display:flex; gap:18px; }
    .col { flex:1; }
    h3 { margin:0 0 8px; }
    .tbl { border:1px solid rgba(0,0,0,.08); border-radius:8px; overflow:hidden; margin-bottom:12px; }
    .tbl-head { padding:6px 10px; font-weight:700; display:flex; justify-content:space-between; }
    .tbl-head .vat { font-weight:400; font-size:11px; opacity:.7; }
    table { width:100%; border-collapse:collapse; }
    th, td { padding:3px 8px; border-top:1px solid rgba(0,0,0,.06); }
    th { font-weight:600; border-top:none; }
    .sub { text-align:right; padding:6px 10px; font-size:12px; }
    .total { color:#fff; padding:8px 12px; border-radius:6px; display:flex; justify-content:space-between; font-weight:700; }
    .profit { margin-top:14px; padding:10px 14px; border-radius:8px; display:flex; justify-content:space-between; font-weight:700; font-size:15px;
      background:${profit < 0 ? "#fdecec" : "#e7f6ec"}; color:${profit < 0 ? "#e5484d" : "#16a35f"}; }
    .note { margin-top:14px; white-space:pre-wrap; color:#374151; }
  </style></head><body>
    <h1>${esc(calc.name || "Projektkalkyl")}</h1>
    <p class="sub-h">Projektkalkyl · ByggExp</p>
    <div class="cols">
      ${col("income", "Intäkter", inc, "#16a35f")}
      ${col("expense", "Kostnader", exp, "#e5484d")}
    </div>
    <div class="profit"><span>Vinst</span><span>${money(profit)}</span></div>
    ${calc.note ? `<div class="note">${esc(calc.note)}</div>` : ""}
  </body></html>`;
}
