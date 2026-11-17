import { combinePlannedDay } from "./planned-day.util";

describe("combinePlannedDay", () => {
  it("has no plan when no order plans the day", () => {
    expect(combinePlannedDay([], [])).toBeNull();
  });

  it("keeps a single order's work day", () => {
    expect(combinePlannedDay([], [8])).toEqual({ planned: 8, orig: 8 });
  });

  it("counts the schedule default once for a person on several orders", () => {
    expect(combinePlannedDay([], [8, 8, 8, 8])).toEqual({
      planned: 8,
      orig: 8,
    });
    expect(combinePlannedDay([], [6, 8])).toEqual({ planned: 8, orig: 8 });
  });

  it("adds up hours entered by hand and drops the default of other orders", () => {
    expect(
      combinePlannedDay(
        [
          { planned: 5, orig: 8 },
          { planned: 3, orig: 8 },
        ],
        [8, 8],
      ),
    ).toEqual({ planned: 8, orig: 16 });
  });

  it("never plans more than 24 hours in a day", () => {
    expect(
      combinePlannedDay(
        [
          { planned: 16, orig: 16 },
          { planned: 16, orig: 16 },
        ],
        [],
      ),
    ).toEqual({ planned: 24, orig: 24 });
  });
});
