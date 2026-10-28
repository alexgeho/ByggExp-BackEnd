// Swedish arbetsgivaravgift (employer social fees) — the one place the rates
// live. Source: Skatteverket "Arbetsgivaravgifter" (checked 2026-10-28):
//   - born 1959 or later ............................ 31.42 %
//   - 67+ at the start of the year (2026: born 1938–1958) — only the
//     ålderspensionsavgift ............................ 10.21 %
//     (until 2025 the limit was 66 at the start of the year)
//   - born 1937 or earlier ............................. 0 %
//   - temporary youth reduction, pay from 2026-04-01 to 2027-09-30: 18 but
//     not yet 23 at the start of the year (2026: born 2003–2007) — 20.81 % on
//     pay up to 25 000 kr per calendar month, the full rate on the rest.
// Without a known birth year the general rate applies (safe side: never
// under-reserve). Växa-stöd and regional reductions are per-company and not
// covered here.

export const EMPLOYER_FEE_GENERAL = 31.42;
export const EMPLOYER_FEE_PENSION_ONLY = 10.21;
export const EMPLOYER_FEE_YOUTH = 20.81;
export const EMPLOYER_FEE_YOUTH_CAP = 25000;
const YOUTH_FROM = "2026-04-01";
const YOUTH_TO = "2027-09-30";

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// Birth year from a personnummer / samordningsnummer (10 or 12 digits). A
// 10-digit number gets its century from "+" (100+ years) or the pay date.
export function birthYearFromPersonalNumber(
  value: string | null | undefined,
  payDate: string,
): number | null {
  const raw = String(value || "").trim();
  const d = raw.replace(/\D/g, "");
  if (d.length === 12) return Number(d.slice(0, 4));
  if (d.length !== 10) return null;
  const now = Number(String(payDate).slice(0, 4)) || new Date().getFullYear();
  const yy = Number(d.slice(0, 2));
  let century = Math.floor(now / 100) * 100;
  if (century + yy > now) century -= 100;
  if (raw.includes("+")) century -= 100;
  return century + yy;
}

// Employer fee for one worker's pay in one run. payDate = YYYY-MM-DD.
export function employerFeeFor(
  gross: number,
  birthYear: number | null | undefined,
  payDate: string,
): { rate: number; fee: number } {
  const amount = Number(gross) || 0;
  const year = Number(String(payDate).slice(0, 4));
  const general = {
    rate: EMPLOYER_FEE_GENERAL,
    fee: round2(amount * (EMPLOYER_FEE_GENERAL / 100)),
  };
  if (!birthYear || !year) return general;

  if (birthYear <= 1937) return { rate: 0, fee: 0 };
  const ageAtYearStart = year - birthYear - 1;
  const seniorAge = year >= 2026 ? 67 : 66;
  if (ageAtYearStart >= seniorAge) {
    return {
      rate: EMPLOYER_FEE_PENSION_ONLY,
      fee: round2(amount * (EMPLOYER_FEE_PENSION_ONLY / 100)),
    };
  }

  const day = String(payDate).slice(0, 10);
  const youthWindow = day >= YOUTH_FROM && day <= YOUTH_TO;
  if (youthWindow && ageAtYearStart >= 18 && ageAtYearStart < 23) {
    const reduced = Math.min(Math.max(amount, 0), EMPLOYER_FEE_YOUTH_CAP);
    const fee =
      reduced * (EMPLOYER_FEE_YOUTH / 100) +
      (amount - reduced) * (EMPLOYER_FEE_GENERAL / 100);
    return { rate: EMPLOYER_FEE_YOUTH, fee: round2(fee) };
  }
  return general;
}
