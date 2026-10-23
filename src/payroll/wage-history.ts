import { Model } from 'mongoose';
import {
  WageRateDocument,
  WageRateReason,
} from './schemas/wage-rate.schema';

// Today in Sweden as YYYY-MM-DD (dates in ByggExp are Swedish calendar days).
export function swedishToday(now = new Date()): string {
  return now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
}

// Earliest possible date: the rate a worker had before history was kept.
export const INITIAL_RATE_DATE = '2000-01-01';

// Records a new dated rate. The first time a worker's rate changes, their
// previous rate is stored as the starting point so earlier periods keep being
// paid at it.
export async function recordWageRate(
  model: Model<WageRateDocument>,
  entry: {
    companyId: string;
    userId: string;
    hourlyRate: number;
    validFrom: string;
    reason: WageRateReason;
    previousRate?: number | null;
    ruleSetId?: string | null;
    createdByUserId?: string | null;
  },
): Promise<void> {
  const hasHistory = await model.exists({ userId: entry.userId });
  if (!hasHistory && entry.previousRate != null && entry.previousRate > 0) {
    await model.create({
      companyId: entry.companyId,
      userId: entry.userId,
      hourlyRate: entry.previousRate,
      validFrom: INITIAL_RATE_DATE,
      reason: 'initial',
    });
  }
  await model
    .findOneAndUpdate(
      { userId: entry.userId, validFrom: entry.validFrom },
      {
        $set: {
          companyId: entry.companyId,
          hourlyRate: entry.hourlyRate,
          reason: entry.reason,
          ruleSetId: entry.ruleSetId ?? null,
          createdByUserId: entry.createdByUserId ?? null,
        },
      },
      { upsert: true },
    )
    .exec();
}

// The rate in force on `date` from a list of entries, or null.
export function latestRate(
  entries: Array<{ validFrom: string; hourlyRate: number }>,
  date: string,
): number | null {
  let best: { validFrom: string; hourlyRate: number } | null = null;
  for (const e of entries) {
    if (e.validFrom <= date && (!best || e.validFrom > best.validFrom)) best = e;
  }
  return best ? best.hourlyRate : null;
}
