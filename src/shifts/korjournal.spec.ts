import {
  reconcileTrips,
  tripsForRepeat,
  buildKorjournal,
  sanitizeTrips,
  sumTripKm,
} from "./korjournal";

describe("körjournal", () => {
  it("cleans trips: trims, drops empty rows, km from odometer", () => {
    const trips = sanitizeTrips([
      { from: "  Hem ", to: "Bygget", purpose: "Arbete", km: 12.34 },
      { from: "", to: "", purpose: "", km: 0 },
      { odometerStart: 1000, odometerEnd: 1025, to: "Grossist" },
      { km: -5, to: "X" },
    ]);
    expect(trips).toHaveLength(3);
    expect(trips[0]).toMatchObject({ from: "Hem", km: 12.3 });
    expect(trips[1].km).toBe(25);
    expect(trips[2].km).toBe(0);
  });

  it("caps the number of trips and the km of one trip", () => {
    const many = Array.from({ length: 30 }, () => ({ km: 5000, to: "A" }));
    const trips = sanitizeTrips(many);
    expect(trips).toHaveLength(20);
    expect(trips[0].km).toBe(2000);
  });

  it("trips sent: travelKm is their sum; emptied list drops the old sum", () => {
    const shift: { trips?: never[]; travelKm?: number } = { travelKm: 7 };
    expect(reconcileTrips(shift as never, {})).toBe(false);
    expect(shift.travelKm).toBe(7);
    reconcileTrips(shift as never, { trips: [{ km: 10.2 }, { km: 4.9 }] });
    expect(shift.travelKm).toBe(15.1);
    reconcileTrips(shift as never, { trips: [] });
    expect(shift.trips).toEqual([]);
    expect(shift.travelKm).toBe(0);
    expect(sumTripKm([])).toBe(0);
  });

  it("emptied list with a typed km in the same save keeps that km", () => {
    const shift = {
      trips: [{ from: "", to: "A", purpose: "", km: 10 }],
      travelKm: 12,
    };
    reconcileTrips(shift, { trips: [], travelKm: 12 });
    expect(shift.travelKm).toBe(12);
  });

  it("only km sent: same as the trips keeps them, different clears them", () => {
    const trips = [{ from: "", to: "A", purpose: "", km: 30 }];
    const same = { trips: [...trips], travelKm: 30 };
    expect(reconcileTrips(same, { travelKm: 30 })).toBe(false);
    expect(same.trips).toHaveLength(1);
    const changed = { trips: [...trips], travelKm: 50 };
    expect(reconcileTrips(changed, { travelKm: 50 })).toBe(true);
    expect(changed.trips).toEqual([]);
    expect(changed.travelKm).toBe(50);
  });

  it("repeat copies trips without odometer", () => {
    expect(
      tripsForRepeat([
        {
          from: "Hem",
          to: "A",
          purpose: "P",
          km: 5,
          odometerStart: 1,
          odometerEnd: 6,
        },
      ]),
    ).toEqual([{ from: "Hem", to: "A", purpose: "P", km: 5 }]);
  });

  it("report: one row per trip, km-only day goes to the project address", () => {
    const report = buildKorjournal(
      [
        {
          shiftDate: "2026-11-03",
          projectId: "p1",
          projectNameSnapshot: "Villa Ek",
          travelKm: 30,
          trips: [
            { from: "Hem", to: "", purpose: "", km: 20 },
            { from: "Bygget", to: "Beijer", purpose: "Material", km: 10 },
          ],
        },
        { shiftDate: "2026-11-01", projectId: "p2", travelKm: 8 },
        { shiftDate: "2026-11-02", projectId: "p2", travelKm: 0 },
      ],
      (id) => (id === "p1" ? "Ekvägen 1" : "Storgatan 2"),
      120,
      450.5,
    );
    expect(report.rows.map((r) => r.date)).toEqual([
      "2026-11-01",
      "2026-11-03",
      "2026-11-03",
    ]);
    expect(report.rows[0]).toMatchObject({ to: "Storgatan 2", km: 8 });
    expect(report.rows[1]).toMatchObject({
      to: "Ekvägen 1",
      purpose: "Villa Ek",
    });
    expect(report.totalKm).toBe(38);
    expect(report.totalCo2Kg).toBe(4.56);
    expect(report.rows[0].co2Kg).toBe(0.96);
    expect(report.receiptsTotal).toBe(450.5);
  });

  it("no CO2 without the car's g/km", () => {
    const report = buildKorjournal(
      [{ shiftDate: "2026-11-01", travelKm: 10 }],
      () => "",
      null,
    );
    expect(report.totalCo2Kg).toBeNull();
    expect(report.rows[0].co2Kg).toBeNull();
  });
});
