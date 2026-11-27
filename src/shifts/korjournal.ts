// Körjournal — pure rules shared by Dagens rapport (saving trips) and the
// körjournal report (PDF / Excel). No database access here, so it is unit
// tested on its own.

import type { ShiftTrip } from "./schemas/shift.schema";

export const MAX_TRIPS_PER_DAY = 20;

const round1 = (n: number) => Math.round(n * 10) / 10;

const text = (value: unknown, max = 200) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const odometer = (value: unknown): number | null => {
  const n = Number(value);
  return value === null || value === undefined || value === "" || !(n >= 0)
    ? null
    : Math.round(n);
};

// Cleans what the app sent: trims text, drops empty rows, takes km from the
// odometer when km is missing, never lets a negative distance through.
export function sanitizeTrips(input: unknown): ShiftTrip[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, MAX_TRIPS_PER_DAY)
    .map((raw: Record<string, unknown>) => {
      const odometerStart = odometer(raw?.odometerStart);
      const odometerEnd = odometer(raw?.odometerEnd);
      let km = Math.max(0, Number(raw?.km) || 0);
      if (!km && odometerStart != null && odometerEnd != null) {
        km = Math.max(0, odometerEnd - odometerStart);
      }
      return {
        from: text(raw?.from),
        to: text(raw?.to),
        purpose: text(raw?.purpose),
        km: round1(Math.min(km, 2000)),
        odometerStart,
        odometerEnd,
      };
    })
    .filter((t) => t.km > 0 || t.from || t.to || t.purpose);
}

export function sumTripKm(trips: ShiftTrip[]): number {
  return round1(trips.reduce((sum, t) => sum + (Number(t.km) || 0), 0));
}

// Keeps trips and travelKm (what payroll pays) in step after a save:
// - trips sent: with trips, travelKm is their sum; an emptied list drops the
//   old sum unless a km was typed in the same save;
// - only km sent and it differs from the trips: the typed km wins and the
//   trips no longer describe it, so they are cleared (a km that only differs
//   by rounding to whole km is the same km).
// Call after travelKm itself has been applied.
export function reconcileTrips(
  shift: { trips?: ShiftTrip[]; travelKm?: number },
  dto: { trips?: unknown; travelKm?: number },
): boolean {
  if (dto.trips !== undefined) {
    const hadTrips = (shift.trips || []).length > 0;
    const clean = sanitizeTrips(dto.trips);
    shift.trips = clean;
    if (clean.length) shift.travelKm = sumTripKm(clean);
    else if (hadTrips && dto.travelKm === undefined) shift.travelKm = 0;
    return true;
  }
  const trips = shift.trips || [];
  if (dto.travelKm === undefined || !trips.length) return false;
  const sum = sumTripKm(trips);
  // Older screens send the day's km rounded to whole km: that is the same
  // km, so the trips stay and the exact sum is kept.
  if (Math.round(Number(dto.travelKm) || 0) === Math.round(sum)) {
    shift.travelKm = sum;
    return false;
  }
  shift.trips = [];
  return true;
}

// "↺ som förra gången": yesterday's trips without odometer readings — those
// are unique to each trip and must not be copied into a new day.
export function tripsForRepeat(trips: ShiftTrip[] = []): ShiftTrip[] {
  return trips.map(({ from, to, purpose, km }) => ({ from, to, purpose, km }));
}

export type KorjournalShift = {
  shiftDate: string;
  projectId?: string | null;
  projectNameSnapshot?: string;
  travelKm?: number;
  trips?: ShiftTrip[];
};

export type KorjournalRow = {
  date: string;
  from: string;
  to: string;
  purpose: string;
  km: number;
  odometerStart: number | null;
  odometerEnd: number | null;
  co2Kg: number | null;
  // true when the day only has km (no trips typed): to/purpose come from the
  // project, so the report marks the row instead of passing it off as typed.
  estimated: boolean;
};

export type KorjournalReport = {
  rows: KorjournalRow[];
  totalKm: number;
  totalCo2Kg: number | null;
  receiptsTotal: number;
};

// One row per trip. A day with km but no trips (typed before the körjournal
// existed, or by an admin) becomes one row to the project's address, so the
// report and payroll never disagree on the kilometres.
export function buildKorjournal(
  shifts: KorjournalShift[],
  projectAddress: (projectId?: string | null) => string,
  co2GPerKm: number | null,
  receiptsTotal = 0,
): KorjournalReport {
  const co2 = (km: number) =>
    co2GPerKm && co2GPerKm > 0 ? Math.round(km * co2GPerKm) / 1000 : null;
  const rows: KorjournalRow[] = [];
  const sorted = [...shifts].sort((a, b) =>
    String(a.shiftDate).localeCompare(String(b.shiftDate)),
  );
  for (const s of sorted) {
    const trips = s.trips || [];
    if (trips.length) {
      for (const t of trips) {
        rows.push({
          date: s.shiftDate,
          from: t.from || "",
          to: t.to || projectAddress(s.projectId),
          purpose: t.purpose || s.projectNameSnapshot || "",
          km: Number(t.km) || 0,
          odometerStart: t.odometerStart ?? null,
          odometerEnd: t.odometerEnd ?? null,
          co2Kg: co2(Number(t.km) || 0),
          estimated: false,
        });
      }
    } else if ((Number(s.travelKm) || 0) > 0) {
      const km = Number(s.travelKm);
      rows.push({
        date: s.shiftDate,
        from: "",
        to: projectAddress(s.projectId),
        purpose: s.projectNameSnapshot || "",
        km,
        odometerStart: null,
        odometerEnd: null,
        co2Kg: co2(km),
        estimated: true,
      });
    }
  }
  const totalKm = round1(rows.reduce((sum, r) => sum + r.km, 0));
  // Sum of the rows, so "Totalt" always equals what is printed above it.
  const totalCo2Kg =
    co2GPerKm && co2GPerKm > 0
      ? Math.round(rows.reduce((sum, r) => sum + (r.co2Kg || 0), 0) * 1000) /
        1000
      : null;
  return {
    rows,
    totalKm,
    totalCo2Kg,
    receiptsTotal: Math.round(receiptsTotal * 100) / 100,
  };
}
