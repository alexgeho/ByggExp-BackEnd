import * as QRCode from "qrcode";

export type InvoiceQrInput = {
  companyName?: string;
  orgNumber?: string;
  ocr?: string;
  invoiceDate?: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  amount?: number;
  bankgiro?: string;
  plusgiro?: string;
};

// Compact a "YYYY-MM-DD" (or similar) date into the "YYYYMMDD" form the
// Swedish invoice-QR standard expects. Returns "" when there's nothing usable.
function toCompactDate(value?: string): string {
  if (!value) {
    return "";
  }
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(0, 8) : digits;
}

/**
 * Build the payment-QR payload used by Swedish bank apps (the BGC/Swedish
 * invoice QR standard: keys uqr, tp, nme, cid, iref, idt, ddt, due, pt, acc).
 * Returns a PNG data URL, or "" when the company has no giro number to pay to
 * (a QR without an account is useless, so we omit it entirely).
 */
export async function buildInvoiceQrDataUrl(
  input: InvoiceQrInput,
): Promise<string> {
  const account = input.bankgiro || input.plusgiro || "";
  if (!account.trim()) {
    return "";
  }

  const payload = {
    uqr: 1,
    tp: 1,
    nme: input.companyName || "",
    cid: (input.orgNumber || "").replace(/\D/g, ""),
    iref: input.ocr || "",
    idt: toCompactDate(input.invoiceDate),
    ddt: toCompactDate(input.dueDate),
    due: Number(input.amount) || 0,
    pt: input.bankgiro ? "BG" : "PG",
    acc: account,
  };

  try {
    return await QRCode.toDataURL(JSON.stringify(payload), {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
    });
  } catch {
    // Never let a QR failure break invoice rendering — just drop the QR.
    return "";
  }
}
