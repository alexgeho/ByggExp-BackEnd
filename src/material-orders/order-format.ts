// Pure builders for the outgoing Materialbeställning: the quick-order CSV and
// the Swedish order e-mail. Kept free of Nest/Mongo so they are unit-tested and
// reusable by any sender (e-mail today, EDI later).

export type OrderRowLike = {
  articleNumber?: string;
  name?: string;
  unit?: string;
  quantity: number;
};

export type OrderContext = {
  orderNumber: number | string;
  supplier: string;
  customerNumber?: string;
  companyName?: string;
  companyOrgNumber?: string;
  projectName?: string;
  projectReference?: string;
  deliveryAddress?: string;
  desiredDate?: string; // YYYY-MM-DD
  comment?: string;
  orderedByName?: string;
  orderedByEmail?: string;
  orderedByPhone?: string;
};

// Swedish decimal comma, no thousands separator, trailing zeros trimmed.
export function formatQuantity(q: number): string {
  const n = Math.round(Number(q) * 1000) / 1000;
  return String(n).replace(".", ",");
}

const csvCell = (v: unknown): string => {
  const s = String(v ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim();
  return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Semicolon CSV, Swedish Excel default. Article number + quantity come first so
// grossist webshop "snabborder / importera från fil" uploads that read
// "artikelnummer;antal" accept the file as is; the rest is for humans.
// Rows without an article number are free-text rows and go in the mail only.
export function buildQuickOrderCsv(rows: OrderRowLike[]): string {
  const lines = ["Artikelnummer;Antal;Enhet;Benämning"];
  for (const r of rows) {
    const nr = String(r.articleNumber ?? "").trim();
    if (!nr || !(Number(r.quantity) > 0)) continue;
    lines.push(
      [nr, formatQuantity(r.quantity), r.unit || "st", r.name || ""]
        .map(csvCell)
        .join(";"),
    );
  }
  // BOM so Excel opens åäö correctly.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Always Swedish — outgoing supplier communication.
export function buildOrderEmail(
  rows: OrderRowLike[],
  ctx: OrderContext,
): { subject: string; text: string; html: string } {
  const who = ctx.companyName || "ByggExp-kund";
  const subject = [
    `Beställning ${ctx.orderNumber}`,
    who,
    ctx.customerNumber ? `kundnr ${ctx.customerNumber}` : "",
    ctx.projectReference || ctx.projectName || "",
  ]
    .filter(Boolean)
    .join(" — ");

  const facts: [string, string | undefined][] = [
    ["Kund", who],
    ["Kundnummer", ctx.customerNumber],
    ["Org.nr", ctx.companyOrgNumber],
    ["Märkning / projekt", ctx.projectReference || ctx.projectName],
    ["Leveransadress", ctx.deliveryAddress],
    ["Önskat leveransdatum", ctx.desiredDate],
    ["Beställare", ctx.orderedByName],
    ["Telefon", ctx.orderedByPhone],
    ["E-post", ctx.orderedByEmail],
  ];
  const shownFacts = facts.filter(([, v]) => v && String(v).trim());

  const textRows = rows.map(
    (r) =>
      `${r.articleNumber || "-"}\t${formatQuantity(r.quantity)} ${r.unit || "st"}\t${r.name || ""}`,
  );
  const text = [
    "Hej,",
    "",
    `Vi vill beställa följande till ${ctx.supplier}.`,
    "",
    ...shownFacts.map(([k, v]) => `${k}: ${v}`),
    "",
    "Artikelnr\tAntal\tBenämning",
    ...textRows,
    "",
    ctx.comment ? `Kommentar: ${ctx.comment}` : "",
    "Bifogad CSV (artikelnummer;antal) kan läsas in som snabborder.",
    "",
    "Vänligen bekräfta ordern med leveransdatum.",
    "",
    "Med vänliga hälsningar",
    ctx.orderedByName || who,
  ]
    .filter((line, i, arr) => line !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n");

  const td = 'style="padding:6px 10px;border-bottom:1px solid #e5e7eb"';
  const html = `
    <p>Hej,</p>
    <p>Vi vill beställa följande till <strong>${esc(ctx.supplier)}</strong>.</p>
    <table style="border-collapse:collapse;margin:8px 0 16px">
      ${shownFacts.map(([k, v]) => `<tr><td style="padding:2px 16px 2px 0;color:#64748b">${esc(k)}</td><td style="padding:2px 0">${esc(v)}</td></tr>`).join("")}
    </table>
    <table style="border-collapse:collapse;min-width:420px">
      <thead><tr>
        <th align="left" ${td}>Artikelnr</th>
        <th align="right" ${td}>Antal</th>
        <th align="left" ${td}>Enhet</th>
        <th align="left" ${td}>Benämning</th>
      </tr></thead>
      <tbody>
        ${rows.map((r) => `<tr><td ${td}>${esc(r.articleNumber || "–")}</td><td align="right" ${td}>${esc(formatQuantity(r.quantity))}</td><td ${td}>${esc(r.unit || "st")}</td><td ${td}>${esc(r.name)}</td></tr>`).join("")}
      </tbody>
    </table>
    ${ctx.comment ? `<p><strong>Kommentar:</strong> ${esc(ctx.comment)}</p>` : ""}
    <p>Vänligen bekräfta ordern med leveransdatum.</p>
    <p>Med vänliga hälsningar<br>${esc(ctx.orderedByName || who)}</p>
  `;
  return { subject, text, html };
}
