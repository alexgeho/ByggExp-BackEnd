import { nextOvertime } from "./overtime.util";
import { OvertimeStatus } from "./schemas/shift.schema";

const H = 3_600_000;
const base = {
  hoursMs: 10 * H,
  previousMs: 0,
  previousStatus: null,
  requestedMs: 2 * H,
  byManager: false,
};

describe("nextOvertime", () => {
  it("puts a worker's new overtime up for approval", () => {
    expect(nextOvertime(base)).toEqual({
      overtimeMs: 2 * H,
      overtimeStatus: OvertimeStatus.Pending,
      decidedByManager: false,
    });
  });

  it("approves overtime a manager enters", () => {
    expect(nextOvertime({ ...base, byManager: true })).toEqual({
      overtimeMs: 2 * H,
      overtimeStatus: OvertimeStatus.Approved,
      decidedByManager: true,
    });
  });

  it("keeps approval when the worker saves the same overtime again", () => {
    const state = nextOvertime({
      ...base,
      previousMs: 2 * H,
      previousStatus: OvertimeStatus.Approved,
    });
    expect(state.overtimeStatus).toBe(OvertimeStatus.Approved);
  });

  it("asks again when the worker changes approved overtime", () => {
    const state = nextOvertime({
      ...base,
      requestedMs: 3 * H,
      previousMs: 2 * H,
      previousStatus: OvertimeStatus.Approved,
    });
    expect(state).toMatchObject({
      overtimeMs: 3 * H,
      overtimeStatus: OvertimeStatus.Pending,
    });
  });

  it("keeps the old split for older apps, trimmed to the new hours", () => {
    const state = nextOvertime({
      ...base,
      hoursMs: 1 * H,
      requestedMs: undefined,
      previousMs: 2 * H,
      previousStatus: OvertimeStatus.Pending,
    });
    expect(state.overtimeMs).toBe(1 * H);
  });

  it("clears the status when there is no overtime", () => {
    expect(nextOvertime({ ...base, requestedMs: 0 })).toEqual({
      overtimeMs: 0,
      overtimeStatus: null,
      decidedByManager: false,
    });
  });
});

// OB inside a day reuses the same rules, inside the hours that are not
// övertid (ShiftsService.applyOb passes hours − övertid as hoursMs).
describe("nextOvertime for OB", () => {
  const H = 3_600_000;

  it("caps OB to the hours left after övertid and leaves it pending for a worker", () => {
    const state = nextOvertime({
      hoursMs: 10 * H - 2 * H,
      previousMs: 0,
      previousStatus: null,
      requestedMs: 9 * H,
      byManager: false,
    });
    expect(state).toEqual({
      overtimeMs: 8 * H,
      overtimeStatus: OvertimeStatus.Pending,
      decidedByManager: false,
    });
  });

  it("approves OB a manager enters", () => {
    expect(
      nextOvertime({
        hoursMs: 8 * H,
        previousMs: 0,
        previousStatus: null,
        requestedMs: 2 * H,
        byManager: true,
      }).overtimeStatus,
    ).toBe(OvertimeStatus.Approved);
  });
});
