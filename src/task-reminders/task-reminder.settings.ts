/**
 * Task reminder repeat limits — adjust here without touching scheduling logic.
 */

/** Default interval for minute-based repeat (minutes between reminders). */
export const DEFAULT_REPEAT_INTERVAL_MINUTES = 15;

export const MIN_REPEAT_INTERVAL_MINUTES = 1;

export const MAX_REPEAT_INTERVAL_MINUTES = 180;

/** Cap on how many minute-interval reminders can be scheduled until the due date. */
export const MAX_MINUTE_REPEAT_RUNS = 64;

/** Cap on how many hourly reminders can be scheduled until the due date. */
export const MAX_HOURLY_REPEAT_RUNS = 64;
