// Planned hours of one person for one day across several orders.
//
// Every order with a work-day window plans a full day for everyone on its team,
// so a person on four open orders used to read as 32 planned hours a day. A
// person works one day, whichever order it is spent on:
//  - hours an admin entered by hand add up (they were split between orders on
//    purpose) and replace the schedule default;
//  - with nothing entered, the schedule default counts once (the longest
//    window), not once per order;
//  - a day never holds more than 24 hours.
export type PlannedPart = { planned: number; orig: number };

const HOURS_IN_DAY = 24;

export function combinePlannedDay(
  adjusted: PlannedPart[],
  baselines: number[],
): { planned: number; orig: number } | null {
  if (adjusted.length) {
    const planned = adjusted.reduce((sum, part) => sum + part.planned, 0);
    const orig = adjusted.reduce((sum, part) => sum + part.orig, 0);
    return {
      planned: Math.min(HOURS_IN_DAY, planned),
      orig: Math.min(HOURS_IN_DAY, orig),
    };
  }
  if (!baselines.length) return null;
  const day = Math.min(HOURS_IN_DAY, Math.max(...baselines));
  return { planned: day, orig: day };
}
