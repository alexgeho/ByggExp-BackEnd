// Warm-up and pacing rules for a sending domain. Pure functions so the queue
// and the admin preview compute exactly the same numbers.
//
// Best practice for a new domain: start with a few dozen mails a day, grow the
// daily volume 20–30 % a day for 2–4 weeks, send in business hours on weekdays
// spread out over the day, and stop when hard bounces climb (> ~5 %).

export type WarmupSettings = {
  warmupEnabled: boolean;
  warmupStartedAt: Date | null;
  warmupStartPerDay: number;
  warmupGrowthPct: number;
  warmupTargetPerDay: number;
  sendWindowEnabled: boolean;
  sendHourFrom: number;
  sendHourTo: number;
  weekdaysOnly: boolean;
  ratePerHour: number;
};

const TZ = "Europe/Stockholm";
const DAY_MS = 24 * 60 * 60 * 1000;

export type LocalTime = {
  date: string; // YYYY-MM-DD in Stockholm
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday … 6 = Saturday
};

export function stockholmTime(now: Date): LocalTime {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: weekdays.indexOf(get("weekday")),
  };
}

// Day of the warm-up, 0 on the day it started.
export function warmupDay(s: WarmupSettings, now: Date): number {
  if (!s.warmupStartedAt) return 0;
  return Math.max(
    0,
    Math.floor(
      (now.getTime() - new Date(s.warmupStartedAt).getTime()) / DAY_MS,
    ),
  );
}

export function capForDay(s: WarmupSettings, day: number): number {
  const start = Math.max(1, s.warmupStartPerDay);
  const target = Math.max(start, s.warmupTargetPerDay);
  const grown = start * Math.pow(1 + Math.max(0, s.warmupGrowthPct) / 100, day);
  return Math.min(target, Math.round(grown));
}

// Daily cap for today, or null when warm-up is off (only ratePerHour applies).
export function dailyCap(s: WarmupSettings, now: Date): number | null {
  if (!s.warmupEnabled) return null;
  return capForDay(s, warmupDay(s, now));
}

// Caps for the next `days` days from the start — for the admin preview.
export function warmupSchedule(s: WarmupSettings, days = 28): number[] {
  return Array.from({ length: days }, (_, d) => capForDay(s, d));
}

// Days until the cap reaches the target.
export function daysToTarget(s: WarmupSettings): number {
  for (let d = 0; d < 365; d++) {
    if (capForDay(s, d) >= Math.max(1, s.warmupTargetPerDay)) return d;
  }
  return 365;
}

export function inSendWindow(s: WarmupSettings, now: Date): boolean {
  if (!s.sendWindowEnabled) return true;
  const t = stockholmTime(now);
  if (s.weekdaysOnly && (t.weekday === 0 || t.weekday === 6)) return false;
  return t.hour >= s.sendHourFrom && t.hour < s.sendHourTo;
}

// Minutes left in today's sending period (window end, or midnight).
export function minutesLeftToday(s: WarmupSettings, now: Date): number {
  const t = stockholmTime(now);
  const endHour = s.sendWindowEnabled ? s.sendHourTo : 24;
  return Math.max(1, endHour * 60 - (t.hour * 60 + t.minute));
}

// How many mails to send this minute. With a daily cap the remaining mails
// are spread evenly over what is left of the day (with a random remainder),
// instead of all going out at once when the window opens.
export function minuteBudget(
  s: WarmupSettings,
  now: Date,
  remainingToday: number | null,
  random: () => number = Math.random,
): number {
  const byRate = Math.max(1, Math.ceil(s.ratePerHour / 60));
  if (remainingToday === null) return byRate;
  if (remainingToday <= 0) return 0;
  const perMinute = remainingToday / minutesLeftToday(s, now);
  const whole = Math.floor(perMinute);
  const n = whole + (random() < perMinute - whole ? 1 : 0);
  return Math.min(byRate, remainingToday, n);
}
