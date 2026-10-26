// Pure mapping from ByggExp data to Fortnox API payloads (no I/O), so every
// rule is unit-testable. The service does the HTTP calls.
//   - invoice → Fortnox Customer + Invoice (+ TaxReduction for ROT/RUT)
//   - lönerunderlag → Fortnox Lön salary + absence transactions
import {
  collectExportRows,
  ExportInput,
  ExportSkipped,
} from "../payroll/wage-export";

// ---- Customers -------------------------------------------------------------

export type InvoiceLike = {
  invoiceNumber: number;
  companyName?: string;
  customerNumber?: string;
  vatNumber?: string;
  address?: string;
  postalCode?: string;
  email?: string;
  phone?: string;
  representative?: string;
  date?: string;
  dueDate?: string;
  deliveryDate?: string;
  orderReference?: string;
  ourReference?: string;
  yourReference?: string;
  reverseVAT?: string | boolean;
  items?: Array<{
    articleNumber?: string;
    description?: string;
    quantity?: number;
    unit?: string;
    price?: number;
    discount?: number;
    vatRate?: number;
    isText?: boolean;
  }>;
  rotEnabled?: boolean;
  deductionType?: string;
  rotPersonalNumber?: string;
  rotProperty?: string;
  rotDeduction?: number;
  creditOfNumber?: number | null;
};

export type ClientLike = {
  clientType?: string; // company | private
  orgNumber?: string;
  personalNumber?: string;
  vatNumber?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  email?: string;
  phone?: string;
};

// Text of a string/number field; anything else is empty.
export const str = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";

const digits = (v: unknown) => str(v).replace(/\D/g, "");

// Org.nr / personnummer as Fortnox stores it: NNNNNN-NNNN. A 12-digit
// personnummer drops the century; a Swedish VAT number (SE + 10 digits + 01)
// gives its org.nr. Anything else returns ''.
export function toFortnoxOrgNumber(value: unknown): string {
  const raw = str(value).trim().toUpperCase();
  let d = digits(raw);
  if (raw.startsWith("SE") && d.length === 12 && d.endsWith("01"))
    d = d.slice(0, 10);
  if (d.length === 12) d = d.slice(2);
  if (d.length !== 10) return "";
  return `${d.slice(0, 6)}-${d.slice(6)}`;
}

// "123 45 Stockholm" → zip + city. Without a leading postal code the whole
// string is the city.
export function splitPostalCode(value: unknown): { zip: string; city: string } {
  const s = str(value).trim();
  const m = s.match(/^(\d{3}\s?\d{2})\s*(.*)$/);
  if (m) return { zip: m[1].replace(/\s/g, ""), city: m[2].trim() };
  return { zip: "", city: s };
}

const truthy = (v: unknown) => v === true || v === "true";
const cut = (v: unknown, max: number) => str(v).trim().slice(0, max);

export function customerOrgNumber(
  invoice: InvoiceLike,
  client?: ClientLike | null,
): string {
  return (
    toFortnoxOrgNumber(client?.orgNumber) ||
    toFortnoxOrgNumber(client?.personalNumber) ||
    toFortnoxOrgNumber(invoice.vatNumber) ||
    toFortnoxOrgNumber(client?.vatNumber) ||
    (invoice.rotEnabled ? toFortnoxOrgNumber(invoice.rotPersonalNumber) : "")
  );
}

export function buildFortnoxCustomer(
  invoice: InvoiceLike,
  client?: ClientLike | null,
) {
  const fromInvoice = splitPostalCode(invoice.postalCode);
  const isPrivate =
    client?.clientType === "private" || (!client && !!invoice.rotEnabled);
  const vat = String(invoice.vatNumber || client?.vatNumber || "").trim();
  const customer: Record<string, unknown> = {
    Name: cut(invoice.companyName, 1024) || `Kund ${invoice.invoiceNumber}`,
    Type: isPrivate ? "PRIVATE" : "COMPANY",
    Address1: cut(invoice.address || client?.address, 1024),
    ZipCode: client?.postalCode ? digits(client.postalCode) : fromInvoice.zip,
    City: cut(client?.city || fromInvoice.city, 1024),
    Email: cut(invoice.email || client?.email, 1024),
    Phone1: cut(invoice.phone || client?.phone, 1024),
    YourReference: cut(invoice.representative, 50),
  };
  const org = customerOrgNumber(invoice, client);
  if (org) customer.OrganisationNumber = org;
  if (/^[A-Z]{2}/i.test(vat)) customer.VATNumber = vat.replace(/\s/g, "");
  if (truthy(invoice.reverseVAT)) customer.VATType = "SEREVERSEDVAT";
  for (const k of Object.keys(customer))
    if (customer[k] === "") delete customer[k];
  return customer;
}

// ---- Invoices --------------------------------------------------------------

const HOUR_UNITS = new Set(["h", "tim", "timme", "timmar", "hour", "hours"]);
// Units Fortnox has out of the box. Anything else is left off the row, since
// an unknown unit code makes Fortnox reject the whole invoice.
const FORTNOX_UNITS: Record<string, string> = {
  st: "st",
  h: "tim",
  tim: "tim",
  timme: "tim",
  timmar: "tim",
  m: "m",
  m2: "m2",
  "m²": "m2",
  m3: "m3",
  "m³": "m3",
  kg: "kg",
  l: "l",
  km: "km",
  dag: "dag",
  dagar: "dag",
  paket: "paket",
};

// Fortnox HouseWorkType for our skattereduktion kinds.
const HOUSE_WORK_TYPE: Record<string, string> = {
  rot: "CONSTRUCTION",
  rut: "HOMEMAINTENANCE",
  green15: "SOLARCELLS",
  green50: "STORAGESELFPRODUCEDELECTRICITY",
};

export const taxReductionType = (invoice: InvoiceLike): string => {
  if (!invoice.rotEnabled) return "none";
  const t = invoice.deductionType || "rot";
  if (t === "rut") return "rut";
  if (t.startsWith("green")) return "green";
  return "rot";
};

const stripHtml = (s: unknown) =>
  str(s)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const n2 = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

export function buildFortnoxInvoiceRows(invoice: InvoiceLike) {
  const reverse = truthy(invoice.reverseVAT);
  const reduction = taxReductionType(invoice);
  return (invoice.items || [])
    .map((item) => {
      const description = cut(stripHtml(item.description), 255);
      if (item.isText) return description ? { Description: description } : null;
      const unitKey = String(item.unit || "")
        .trim()
        .toLowerCase();
      const row: Record<string, unknown> = {
        Description: description || "-",
        DeliveredQuantity: String(n2(item.quantity)),
        Price: n2(item.price),
        VAT: reverse ? 0 : Math.round(Number(item.vatRate ?? 25)),
      };
      if (FORTNOX_UNITS[unitKey]) row.Unit = FORTNOX_UNITS[unitKey];
      if (Number(item.discount)) {
        row.Discount = n2(item.discount);
        row.DiscountType = "PERCENT";
      }
      // Labour rows (hour units) carry the skattereduktion.
      if (reduction !== "none" && HOUR_UNITS.has(unitKey)) {
        row.HouseWork = true;
        row.HouseWorkType =
          HOUSE_WORK_TYPE[invoice.deductionType || "rot"] || "CONSTRUCTION";
        row.HouseWorkHoursToReport = Math.min(
          999,
          Math.max(0, Math.round(Math.abs(Number(item.quantity) || 0))),
        );
      }
      return row;
    })
    .filter((r): r is Record<string, unknown> => !!r);
}

export function buildFortnoxInvoice(
  invoice: InvoiceLike,
  customerNumber: string,
  opts: { currency?: string; creditReference?: string } = {},
) {
  const payload: Record<string, unknown> = {
    CustomerNumber: customerNumber,
    InvoiceDate: invoice.date || undefined,
    DueDate: invoice.dueDate || undefined,
    DeliveryDate: invoice.deliveryDate || undefined,
    Currency: opts.currency || "SEK",
    Language: "SV",
    VATIncluded: false,
    OurReference: cut(invoice.ourReference, 50) || undefined,
    YourReference:
      cut(invoice.yourReference || invoice.representative, 50) || undefined,
    YourOrderNumber: cut(invoice.orderReference, 30) || undefined,
    ExternalInvoiceReference1: `ByggExp ${invoice.invoiceNumber}`,
    TaxReductionType: taxReductionType(invoice),
    InvoiceRows: buildFortnoxInvoiceRows(invoice),
  };
  if (opts.creditReference)
    payload.CreditInvoiceReference = opts.creditReference;
  for (const k of Object.keys(payload))
    if (payload[k] === undefined) delete payload[k];
  return { Invoice: payload };
}

// ROT/RUT application tied to the Fortnox invoice. Grön teknik needs a
// per-type amount split Fortnox calls TaxReductionAmounts, which we don't
// track, so it is left to be completed in Fortnox.
export function buildFortnoxTaxReduction(
  invoice: InvoiceLike,
  documentNumber: string,
  customerName: string,
) {
  const type = taxReductionType(invoice);
  if (type !== "rot" && type !== "rut") return null;
  const ssn = toFortnoxOrgNumber(invoice.rotPersonalNumber);
  const asked = Math.abs(n2(invoice.rotDeduction));
  if (!ssn || asked < 1) return null;
  const reduction: Record<string, unknown> = {
    CustomerName: cut(customerName, 1024),
    ReferenceDocumentType: "INVOICE",
    ReferenceNumber: String(documentNumber),
    SocialSecurityNumber: ssn,
    AskedAmount: asked,
  };
  if (type === "rot" && invoice.rotProperty) {
    reduction.PropertyDesignation = cut(invoice.rotProperty, 255);
  }
  return { TaxReduction: reduction };
}

// ---- Lön -------------------------------------------------------------------

// Frånvarokoder Fortnox Lön accepts on an absence transaction.
export const FORTNOX_ABSENCE_CODES = new Set([
  "ASK",
  "FPE",
  "FRA",
  "HAV",
  "KOM",
  "MIL",
  "NAR",
  "OS1",
  "OS2",
  "OS3",
  "OS4",
  "OS5",
  "PAP",
  "PEM",
  "PER",
  "SEM",
  "SJK",
  "SMB",
  "SVE",
  "TJL",
  "UTB",
  "VAB",
]);

export type FortnoxSkipped =
  | ExportSkipped
  | {
      userId: string;
      name: string;
      code: string;
      reason: "unknown_absence_code";
    };

export type FortnoxWageTransactions = {
  salary: Array<{ SalaryTransaction: Record<string, unknown> }>;
  absence: Array<{ AbsenceTransaction: Record<string, unknown> }>;
  skipped: FortnoxSkipped[];
};

// The same rows the PAXml export writes, as Fortnox Lön transactions: pay
// items → salary transactions on the company's löneart, absence → absence
// transactions on the frånvarokod. Worked hours already go as salary
// transactions (timlön), so no attendance transactions are sent.
export function buildFortnoxWageTransactions(
  input: ExportInput,
): FortnoxWageTransactions {
  const { salary, absence, skipped } = collectExportRows(input);
  const out: FortnoxWageTransactions = {
    salary: [],
    absence: [],
    skipped: [...skipped],
  };
  const userIdOf = new Map(
    input.workers.map((w) => [String(w.employeeId || "").trim(), w.userId]),
  );

  for (const { employeeId, code, item, name } of salary) {
    const amountOnly = item.unit === "sek";
    const tx: Record<string, unknown> = {
      EmployeeId: employeeId,
      SalaryCode: code,
      Date: item.date,
      Number: amountOnly ? "1" : String(n2(item.quantity)),
      Amount: String(amountOnly ? n2(item.amount) : n2(item.unitPrice)),
      TextRow: cut(item.label || name, 40),
    };
    out.salary.push({ SalaryTransaction: tx });
  }

  for (const { employeeId, code, item, name } of absence) {
    const cause = code.toUpperCase();
    if (!FORTNOX_ABSENCE_CODES.has(cause)) {
      out.skipped.push({
        userId: userIdOf.get(employeeId) || "",
        name,
        code: item.code,
        reason: "unknown_absence_code",
      });
      continue;
    }
    out.absence.push({
      AbsenceTransaction: {
        EmployeeId: employeeId,
        CauseCode: cause,
        Date: item.date,
        Hours: n2(item.quantity),
      },
    });
  }
  return out;
}
