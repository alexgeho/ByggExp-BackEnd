import {
  balanceTrans,
  formatSieDate,
  SIE_ACCOUNTS,
  SieVerification,
} from "./sie.util";

// Minimal shapes needed for the SIE mapping (subset of the Mongoose docs).
export type InvoiceLike = {
  invoiceNumber: number;
  date?: string;
  createdAt?: string | Date;
  subtotal?: number;
  vat?: number;
  total?: number;
  roundedTotal?: number;
  rounding?: number;
  reverseVAT?: string | boolean;
  rotEnabled?: boolean;
  rotDeduction?: number;
  creditOfNumber?: number | null;
  companyName?: string;
};

export type SupplierInvoiceLike = {
  invoiceNumber?: string;
  invoiceDate?: string;
  createdAt?: string | Date;
  supplierName?: string;
  amountExclVat?: number;
  vat?: number;
  total?: number;
};

const isReverse = (v: unknown) => v === true || String(v) === "true";

// Customer invoice → a sales verification (series F). Handles reverse-charge
// VAT (omvänd byggmoms), ROT receivable, and öresavrundning.
export function invoiceToVerification(inv: InvoiceLike): SieVerification {
  const reverse = isReverse(inv.reverseVAT);
  const net = Number(inv.subtotal) || 0;
  const vat = reverse ? 0 : Number(inv.vat) || 0;
  const salesAccount = reverse
    ? SIE_ACCOUNTS.salesReverse.n
    : SIE_ACCOUNTS.sales.n;
  const rot = inv.rotEnabled ? Number(inv.rotDeduction) || 0 : 0;
  // What the customer actually owes (after ROT + rounding).
  const arAmount =
    inv.roundedTotal !== undefined
      ? Number(inv.roundedTotal) || 0
      : (Number(inv.total) || 0) - rot;

  const trans = balanceTrans([
    { account: SIE_ACCOUNTS.ar.n, amount: arAmount },
    { account: SIE_ACCOUNTS.rot.n, amount: rot },
    { account: salesAccount, amount: -net },
    { account: SIE_ACCOUNTS.outVat.n, amount: -vat },
  ]);

  const isCredit = inv.creditOfNumber != null;
  return {
    series: "F",
    number: inv.invoiceNumber,
    date: formatSieDate(inv.date || inv.createdAt),
    text: `${isCredit ? "Kreditfaktura" : "Faktura"} ${inv.invoiceNumber}${
      inv.companyName ? ` – ${inv.companyName}` : ""
    }`,
    trans,
  };
}

// Supplier invoice → a purchase verification (series L).
export function supplierInvoiceToVerification(
  si: SupplierInvoiceLike,
  seq: number,
): SieVerification {
  const excl = Number(si.amountExclVat) || 0;
  const vat = Number(si.vat) || 0;
  const total = Number(si.total) || excl + vat;

  const trans = balanceTrans([
    { account: SIE_ACCOUNTS.purchase.n, amount: excl },
    { account: SIE_ACCOUNTS.inVat.n, amount: vat },
    { account: SIE_ACCOUNTS.ap.n, amount: -total },
  ]);

  return {
    series: "L",
    number: seq,
    date: formatSieDate(si.invoiceDate || si.createdAt),
    text: `Lev ${si.supplierName || ""}${
      si.invoiceNumber ? ` ${si.invoiceNumber}` : ""
    }`.trim(),
    trans,
  };
}
