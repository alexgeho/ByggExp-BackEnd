import { normalizeCarFields } from "./users.service";

describe("normalizeCarFields", () => {
  it("cleans the reg nr and the CO2 value", () => {
    expect(
      normalizeCarFields({ carRegNumber: " abc 123 ", carCo2GPerKm: "119,6" }),
    ).toEqual({
      carRegNumber: "ABC123",
      carCo2GPerKm: 120,
    });
  });
  it("turns nonsense CO2 into null and leaves absent fields out", () => {
    expect(normalizeCarFields({ carCo2GPerKm: -5 })).toEqual({
      carCo2GPerKm: null,
    });
    expect(normalizeCarFields({ carCo2GPerKm: "abc" })).toEqual({
      carCo2GPerKm: null,
    });
    expect(normalizeCarFields({ carCo2GPerKm: 1e9 })).toEqual({
      carCo2GPerKm: null,
    });
    expect(normalizeCarFields({ carCo2GPerKm: "" })).toEqual({
      carCo2GPerKm: null,
    });
    expect(normalizeCarFields({})).toEqual({});
  });
});
