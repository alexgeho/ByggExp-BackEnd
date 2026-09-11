// Late-payment reminder (betalningspåminnelse) math for overdue customer
// invoices. Swedish statutory model:
//   - dröjsmålsränta = Riksbankens referensränta + 8 percentage points (unless
//     otherwise agreed), accruing per day from the day after the due date;
//   - påminnelseavgift: max 60 kr per reminder (only if agreed/stated).
// The reference rate changes twice a year, so it is a parameter (env-configured)
// rather than hard-coded. Pure + side-effect free so it is unit-testable.

export const DEFAULT_REMINDER_FEE_SEK = 60;
export const LATE_INTEREST_MARKUP = 8; // percentage points above referensränta
export const DEFAULT_REFERENCE_RATE_PERCENT = 2; // placeholder — confirm current Riksbank rate

const DAY_MS = 86400000;
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export interface ReminderInput {
  principal: number; // outstanding amount (roundedTotal/total), incl VAT
  dueDate: string; // YYYY-MM-DD
  now?: Date;
  referenceRatePercent?: number;
  feeSek?: number;
}

export interface ReminderResult {
  daysOverdue: number;
  interestRatePercent: number; // referensränta + 8
  interest: number; // accrued dröjsmålsränta so far
  fee: number; // påminnelseavgift
  principal: number;
  newTotal: number; // principal + interest + fee
}

const startOfDayMs = (input: string | number | Date): number => {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function computeReminder(input: ReminderInput): ReminderResult {
  const principal = round2(input.principal);
  const now = input.now ?? new Date();
  const refRate = Number.isFinite(input.referenceRatePercent as number)
    ? (input.referenceRatePercent as number)
    : DEFAULT_REFERENCE_RATE_PERCENT;
  const fee = Number.isFinite(input.feeSek as number)
    ? (input.feeSek as number)
    : DEFAULT_REMINDER_FEE_SEK;
  const interestRatePercent = refRate + LATE_INTEREST_MARKUP;

  let daysOverdue = 0;
  if (input.dueDate) {
    const diff = Math.floor((startOfDayMs(now) - startOfDayMs(input.dueDate)) / DAY_MS);
    daysOverdue = Math.max(0, diff);
  }

  // Simple daily accrual on the principal: principal × rate/100 × days/365.
  const interest = round2(principal * (interestRatePercent / 100) * (daysOverdue / 365));
  const newTotal = round2(principal + interest + fee);

  return { daysOverdue, interestRatePercent, interest, fee, principal, newTotal };
}
