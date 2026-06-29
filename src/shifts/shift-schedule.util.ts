export const DEFAULT_SHIFT_TIMEZONE = 'Europe/Oslo';

export interface ShiftScheduleConfig {
  enabled?: boolean;
  workDayStartTime?: string;
  workDayEndTime?: string;
  startGraceMinutes?: number;
  endGraceMinutes?: number;
  timezone?: string;
}

export interface ShiftScheduleWindow {
  enforced: boolean;
  canStart: boolean;
  canComplete: boolean;
  earliestStartLabel?: string;
  latestStartLabel?: string;
  latestCompleteLabel?: string;
  nowMinutes?: number;
  message?: string;
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 0;
  }

  return hours * 60 + minutes;
}

export function formatMinutesAsTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value || 0);

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

export function getMinutesOfDayInTimezone(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  return parts.hour * 60 + parts.minute;
}

export function getShiftScheduleWindow(
  schedule: ShiftScheduleConfig | null | undefined,
  at: Date = new Date(),
): ShiftScheduleWindow {
  if (!schedule?.enabled) {
    return {
      enforced: false,
      canStart: true,
      canComplete: true,
    };
  }

  const timezone = schedule.timezone || DEFAULT_SHIFT_TIMEZONE;
  const startMinutes = parseTimeToMinutes(schedule.workDayStartTime || '07:00');
  const endMinutes = parseTimeToMinutes(schedule.workDayEndTime || '16:00');
  const startGrace = schedule.startGraceMinutes ?? 0;
  const endGrace = schedule.endGraceMinutes ?? 0;

  if (endMinutes <= startMinutes) {
    return {
      enforced: true,
      canStart: false,
      canComplete: false,
      message: 'Invalid work day hours configured for this project.',
    };
  }

  const nowMinutes = getMinutesOfDayInTimezone(at, timezone);
  const earliestStart = startMinutes - startGrace;
  const latestStart = endMinutes;
  const latestComplete = endMinutes + endGrace;
  const canStart = nowMinutes >= earliestStart && nowMinutes <= latestStart;
  const canComplete = nowMinutes <= latestComplete;

  return {
    enforced: true,
    canStart,
    canComplete,
    nowMinutes,
    earliestStartLabel: formatMinutesAsTime(earliestStart),
    latestStartLabel: formatMinutesAsTime(latestStart),
    latestCompleteLabel: formatMinutesAsTime(latestComplete),
    message: !canStart
      ? `Shift can be started between ${formatMinutesAsTime(earliestStart)} and ${formatMinutesAsTime(latestStart)}.`
      : undefined,
  };
}

export function getStartWindowErrorMessage(window: ShiftScheduleWindow): string {
  return (
    window.message ||
    `Shift can be started between ${window.earliestStartLabel} and ${window.latestStartLabel}.`
  );
}

export function getCompleteWindowErrorMessage(window: ShiftScheduleWindow): string {
  return `Shift must be completed by ${window.latestCompleteLabel}.`;
}

export function isPastShiftScheduleDeadline(
  schedule: ShiftScheduleConfig,
  at: Date = new Date(),
): boolean {
  const window = getShiftScheduleWindow(schedule, at);
  return window.enforced && !window.canComplete;
}

export function zonedTimeToDate(
  dateKey: string,
  hours: number,
  minutes: number,
  seconds = 0,
  milliseconds = 0,
  timeZone = DEFAULT_SHIFT_TIMEZONE,
): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  let candidate = Date.UTC(year, month - 1, day, hours, minutes, seconds, milliseconds);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const parts = getZonedParts(new Date(candidate), timeZone);

    if (
      parts.year === year &&
      parts.month === month &&
      parts.day === day &&
      parts.hour === hours &&
      parts.minute === minutes
    ) {
      return new Date(candidate);
    }

    const targetMinutes = hours * 60 + minutes;
    const currentMinutes = parts.hour * 60 + parts.minute;
    let diffMinutes = targetMinutes - currentMinutes;

    if (parts.day !== day) {
      diffMinutes += (day - parts.day) * 24 * 60;
    }

    candidate += diffMinutes * 60 * 1000;
  }

  return new Date(candidate);
}

export function getScheduledShiftDeadline(
  schedule: ShiftScheduleConfig,
  shiftDate: string,
): Date | null {
  if (!schedule?.enabled) {
    return null;
  }

  const timezone = schedule.timezone || DEFAULT_SHIFT_TIMEZONE;
  const endMinutes =
    parseTimeToMinutes(schedule.workDayEndTime || '16:00') +
    (schedule.endGraceMinutes ?? 0);
  const hours = Math.floor(endMinutes / 60);
  const minutes = endMinutes % 60;

  return zonedTimeToDate(shiftDate, hours, minutes, 59, 999, timezone);
}

export function normalizeShiftSchedule(
  schedule?: ShiftScheduleConfig | null,
): ShiftScheduleConfig | undefined {
  if (!schedule) {
    return undefined;
  }

  return {
    enabled: Boolean(schedule.enabled),
    workDayStartTime: schedule.workDayStartTime || '07:00',
    workDayEndTime: schedule.workDayEndTime || '16:00',
    startGraceMinutes: schedule.startGraceMinutes ?? 20,
    endGraceMinutes: schedule.endGraceMinutes ?? 20,
    timezone: schedule.timezone || DEFAULT_SHIFT_TIMEZONE,
  };
}
