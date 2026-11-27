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

// Applies trips (when sent) to a shift-like object. With trips, travelKm is
// their sum; an empty list clears the trips but keeps the km typed by hand.
export function applyTrips(
  shift: { trips?: ShiftTrip[]; travelKm?: number },
  trips: unknown,
): boolean {
  if (trips === undefined) return false;
  const clean = sanitizeTrips(trips);
  shift.trips = clean;
  if (clean.length) shift.travelKm = sumTripKm(clean);
  return true;
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
      });
    }
  }
  const totalKm = round1(rows.reduce((sum, r) => sum + r.km, 0));
  const totalCo2Kg =
    co2GPerKm && co2GPerKm > 0 ? Math.round(totalKm * co2GPerKm) / 1000 : null;
  return {
    rows,
    totalKm,
    totalCo2Kg,
    receiptsTotal: Math.round(receiptsTotal * 100) / 100,
  };
}
