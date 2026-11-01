// Norwegian (country = "NO") helpers for invoices and quotes: kontonummer
// validation, KID generation, nb-NO money/date formatting and VAT rates.
// Pure functions — unit-tested in norway.spec.ts.

export type KidMode = "none" | "mod10" | "mod11";
// Default for Norwegian companies that never chose: MOD10 always yields a
// digit. MOD11 is offered too, but ~1 in 11 numbers gets "-" as check digit
// (valid per Nets, yet some banks' forms reject it).
export const DEFAULT_KID_MODE: KidMode = "mod10";
export const KID_MODES: KidMode[] = ["none", "mod10", "mod11"];

// MVA rates in Norway: 25 % general, 15 % food, 12 % (transport, cinema,
// accommodation …), 0 % (zero-rated). Swedish 6 % must never be offered.
export const VAT_RATES_BY_COUNTRY: Record<string, number[]> = {
  SE: [25, 12, 6, 0],
  NO: [25, 15, 12, 0],
};

export const isNorway = (country?: string | null): boolean =>
  String(country || "").toUpperCase() === "NO";

export const vatRatesForCountry = (country?: string | null): number[] =>
  VAT_RATES_BY_COUNTRY[isNorway(country) ? "NO" : "SE"];

const digitsOnly = (value?: string | number | null) =>
  String(value ?? "").replace(/\D/g, "");

// MOD11 check digit with weights 2,3,4,5,6,7 repeating from the right (the
// scheme used by Norwegian bank account numbers and KID). Returns null when
// the remainder makes the number invalid (check digit would be 10).
function mod11CheckDigit(body: string): number | null {
  let sum = 0;
  let weight = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * weight;
    weight = weight === 7 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  if (rest === 0) return 0;
  const check = 11 - rest;
  return check === 10 ? null : check;
}

// Luhn / MOD10 check digit (weights 2,1 alternating from the right).
function mod10CheckDigit(body: string): number {
  let sum = 0;
  let double = true;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    let d = Number(body[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

// Norwegian bank account number: 11 digits, the last a MOD11 check digit over
// the first ten (weights 5,4,3,2,7,6,5,4,3,2 — identical to the 2..7 cycle
// above for a 10-digit body). Spaces and dots are allowed in input.
export function isValidKontonummer(value?: string | null): boolean {
  const d = digitsOnly(value);
  if (d.length !== 11) return false;
  const check = mod11CheckDigit(d.slice(0, 10));
  return check !== null && check === Number(d[10]);
}

// "12345678903" → "1234.56.78903" (the conventional printed form).
export function formatKontonummer(value?: string | null): string {
  const d = digitsOnly(value);
  if (d.length !== 11) return String(value ?? "");
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
}

// KID (kundeidentifikasjon) built from the invoice number plus a check digit.
// MOD11 numbers whose check digit would be 10 get "-" as Nets/Mastercard
// Payment Services allow. Returns "" when KID is switched off.
export function generateKid(
  invoiceNumber: number | string,
  mode?: string | null,
): string {
  const body = digitsOnly(invoiceNumber);
  if (!body || !mode || mode === "none") return "";
  if (mode === "mod10") return `${body}${mod10CheckDigit(body)}`;
  if (mode === "mod11") {
    const check = mod11CheckDigit(body);
    return `${body}${check === null ? "-" : check}`;
  }
  return "";
}

export function isValidKid(kid: string, mode: KidMode): boolean {
  if (!kid || mode === "none") return false;
  const body = kid.slice(0, -1);
  return generateKid(body, mode) === kid;
}

// nb-NO number with two decimals: 1234.5 → "1 234,50" (non-breaking spaces as
// Intl produces them).
export function formatNokNumber(value?: number | null): string {
  return new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

// Amount with currency as Norwegians write it on invoices: "kr 1 234,50".
export function formatNok(value?: number | null): string {
  return `kr ${formatNokNumber(value)}`;
}

// "2026-08-13" → "13.08.2026". Anything that is not an ISO date is returned as-is.
export function formatNoDate(value?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(value ?? "");
}

// Org.nr as printed on a Norwegian sales document. Bokføringsforskriften
// § 5-1-2 (2): «Dersom selger er registrert i Merverdiavgiftsregisteret, skal
// organisasjonsnummer etterfølges av bokstavene MVA.» "123456789" →
// "123 456 789 MVA".
export function formatNoOrgNumber(
  orgNumber?: string | null,
  mvaRegistered?: boolean,
): string {
  const d = digitsOnly(orgNumber);
  const pretty =
    d.length === 9
      ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
      : String(orgNumber ?? "").trim();
  if (!pretty) return "";
  return mvaRegistered ? `${pretty} MVA` : pretty;
}
