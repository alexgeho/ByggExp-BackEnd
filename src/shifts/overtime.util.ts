import { OvertimeStatus } from "./schemas/shift.schema";

export type OvertimeState = {
  overtimeMs: number;
  overtimeStatus: OvertimeStatus | null;
  // true when a manager made the call, so the decision is stamped with them.
  decidedByManager: boolean;
};

// The day's övertid after its hours were entered or changed. `requestedMs`
// left out (older apps) keeps the split the day had, trimmed to the hours.
// Overtime a manager enters or changes counts as approved; a worker's new or
// changed overtime waits for a manager, unchanged overtime keeps its status.
export function nextOvertime(params: {
  hoursMs: number;
  previousMs: number;
  previousStatus: OvertimeStatus | null;
  requestedMs: number | undefined;
  byManager: boolean;
}): OvertimeState {
  const { hoursMs, previousMs, previousStatus, requestedMs, byManager } =
    params;
  const overtimeMs = Math.min(
    Math.max(0, Math.round(requestedMs ?? previousMs)),
    Math.max(0, hoursMs),
  );

  if (overtimeMs === 0) {
    return { overtimeMs, overtimeStatus: null, decidedByManager: false };
  }
  if (byManager) {
    return {
      overtimeMs,
      overtimeStatus: OvertimeStatus.Approved,
      decidedByManager: true,
    };
  }
  if (overtimeMs !== previousMs || !previousStatus) {
    return {
      overtimeMs,
      overtimeStatus: OvertimeStatus.Pending,
      decidedByManager: false,
    };
  }
  return {
    overtimeMs,
    overtimeStatus: previousStatus,
    decidedByManager: false,
  };
}
