// Arbetsgivardeklaration på individnivå (AGI) — XML file for upload in
// Skatteverket's e-service. Pure, unit-tested; validated against
// arbetsgivardeklaration_1.1.xsd (teknisk beskrivning 1.1.18.2).
//   - one HU (huvuduppgift) + one IU (individuppgift) per employee
//   - 487/497 (sums) are left out: Skatteverket computes them from the IUs,
//     which also covers the age-based employer-fee rules
//   - period = the month the pay was paid out (YYYYMM)

export type AgiEmployee = {
  personalNumber: string; // personnummer / samordningsnummer, any format
  name: string;
  gross: number; // KontantErsattningUlagAG (011)
  tax: number; // AvdrPrelSkatt (001)
  workplaceStreet?: string; // 245, only when one tjänsteställe in the period
  workplaceCity?: string; // 246
};

export type AgiInput = {
  period: string; // YYYYMM
  orgNumber: string; // company org.nr, any format
  createdAt: Date;
  contact: { name: string; phone: string; email: string };
  employees: AgiEmployee[];
};

const NS = "http://xmls.skatteverket.se/se/skatteverket/da/instans/schema/1.1";
const AGD =
  "http://xmls.skatteverket.se/se/skatteverket/da/komponent/schema/1.1";

const digits = (v: string) => String(v || "").replace(/\D/g, "");

// Org.nr → 12 digits "16XXXXXXXXXX".
export function agiOrgId(orgNumber: string): string | null {
  const d = digits(orgNumber);
  if (d.length === 10) return `16${d}`;
  if (d.length === 12 && d.startsWith("16")) return d;
  return null;
}

// Personnummer → 12 digits ÅÅÅÅMMDDNNNN. A 10-digit number gets its century
// from the "+" separator (100+ years old) or the current date.
export function agiPersonId(value: string, today = new Date()): string | null {
  const raw = String(value || "").trim();
  const d = digits(raw);
  if (d.length === 12) return d;
  if (d.length !== 10) return null;
  const yy = Number(d.slice(0, 2));
  const now = today.getFullYear();
  let century = Math.floor(now / 100) * 100;
  if (century + yy > now) century -= 100;
  if (raw.includes("+")) century -= 100;
  return `${century + yy}${d.slice(2)}`;
}

const esc = (v: string) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "")
    .replace(/>/g, "")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .trim();

const whole = (n: number) => Math.max(0, Math.round(Number(n) || 0));

// Problems that make the file unusable (shown to the admin before download).
export function agiProblems(input: AgiInput): string[] {
  const out: string[] = [];
  if (!/^\d{6}$/.test(input.period)) out.push("period");
  if (!agiOrgId(input.orgNumber)) out.push("orgNumber");
  if (!input.contact.name || !input.contact.phone || !input.contact.email) {
    out.push("contact");
  }
  for (const e of input.employees) {
    if (!agiPersonId(e.personalNumber, input.createdAt)) {
      out.push(`personalNumber:${e.name}`);
    }
  }
  if (!input.employees.length) out.push("employees");
  return out;
}

const blankett = (orgId: string, period: string, body: string) =>
  `  <agd:Blankett>
    <agd:Arendeinformation><agd:Arendeagare>${orgId}</agd:Arendeagare><agd:Period>${period}</agd:Period></agd:Arendeinformation>
    <agd:Blankettinnehall>${body}</agd:Blankettinnehall>
  </agd:Blankett>
`;

export function buildAgiXml(input: AgiInput): string {
  const orgId = agiOrgId(input.orgNumber) as string;
  const p = input.period;
  const created = input.createdAt.toISOString().slice(0, 19);
  const contact = `<agd:Namn>${esc(input.contact.name)}</agd:Namn><agd:Telefon>${esc(input.contact.phone)}</agd:Telefon><agd:Epostadress>${esc(input.contact.email)}</agd:Epostadress>`;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Skatteverket omrade="Arbetsgivardeklaration" xmlns="${NS}" xmlns:agd="${AGD}">
  <agd:Avsandare>
    <agd:Programnamn>ByggExp</agd:Programnamn>
    <agd:Organisationsnummer>${orgId}</agd:Organisationsnummer>
    <agd:TekniskKontaktperson>${contact}</agd:TekniskKontaktperson>
    <agd:Skapad>${created}</agd:Skapad>
  </agd:Avsandare>
  <agd:Blankettgemensamt>
    <agd:Arbetsgivare>
      <agd:AgRegistreradId>${orgId}</agd:AgRegistreradId>
      <agd:Kontaktperson>${contact}</agd:Kontaktperson>
    </agd:Arbetsgivare>
  </agd:Blankettgemensamt>
`;
  xml += blankett(
    orgId,
    p,
    `<agd:HU><agd:ArbetsgivareHUGROUP><agd:AgRegistreradId faltkod="201">${orgId}</agd:AgRegistreradId></agd:ArbetsgivareHUGROUP><agd:RedovisningsPeriod faltkod="006">${p}</agd:RedovisningsPeriod></agd:HU>`,
  );
  for (const e of input.employees) {
    const pid = agiPersonId(e.personalNumber, input.createdAt) as string;
    const place =
      e.workplaceStreet && e.workplaceCity
        ? `<agd:ArbetsplatsensGatuadress faltkod="245">${esc(e.workplaceStreet)}</agd:ArbetsplatsensGatuadress><agd:ArbetsplatsensOrt faltkod="246">${esc(e.workplaceCity)}</agd:ArbetsplatsensOrt>`
        : "";
    xml += blankett(
      orgId,
      p,
      `<agd:IU><agd:ArbetsgivareIUGROUP><agd:AgRegistreradId faltkod="201">${orgId}</agd:AgRegistreradId></agd:ArbetsgivareIUGROUP><agd:BetalningsmottagareIUGROUP><agd:BetalningsmottagareIDChoice><agd:BetalningsmottagarId faltkod="215">${pid}</agd:BetalningsmottagarId></agd:BetalningsmottagareIDChoice></agd:BetalningsmottagareIUGROUP><agd:RedovisningsPeriod faltkod="006">${p}</agd:RedovisningsPeriod><agd:Specifikationsnummer faltkod="570">1</agd:Specifikationsnummer>${place}<agd:KontantErsattningUlagAG faltkod="011">${whole(e.gross)}</agd:KontantErsattningUlagAG><agd:AvdrPrelSkatt faltkod="001">${whole(e.tax)}</agd:AvdrPrelSkatt></agd:IU>`,
    );
  }
  return `${xml}</Skatteverket>\n`;
}

// Employees paid in several runs in the same month → one IU each (sums).
export function mergeEmployees(rows: AgiEmployee[]): AgiEmployee[] {
  const by = new Map<string, AgiEmployee>();
  for (const r of rows) {
    const key = digits(r.personalNumber) || r.name;
    const cur = by.get(key);
    if (!cur) {
      by.set(key, { ...r });
      continue;
    }
    cur.gross += r.gross;
    cur.tax += r.tax;
    const samePlace =
      cur.workplaceStreet === r.workplaceStreet &&
      cur.workplaceCity === r.workplaceCity;
    if (!samePlace) {
      cur.workplaceStreet = undefined;
      cur.workplaceCity = undefined;
    }
  }
  return [...by.values()];
}
