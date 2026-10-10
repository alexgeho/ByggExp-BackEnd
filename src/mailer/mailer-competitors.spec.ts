import {
  byggexpMonthly,
  findCompetitor,
  savingsFor,
} from "./mailer-competitors";

describe("competitor savings", () => {
  it("prices ByggExp Komplett per team size", () => {
    expect(byggexpMonthly(5)).toBe(990);
    expect(byggexpMonthly(12)).toBe(990 + 2 * 119);
  });

  it("computes Bygglet savings from list prices", () => {
    const five = savingsFor("Bygglet").find((s) => s.users === 5);
    expect(five).toEqual({ users: 5, theirs: 2337, ours: 990, saving: 1347 });
  });

  it("has no figure when the price is not public", () => {
    expect(savingsFor("Softone")).toEqual([]);
  });

  it("recognises products in reply text", () => {
    expect(findCompetitor("Vi kör Softone sedan länge")?.name).toBe("Softone");
    expect(findCompetitor("Vi har en egen app")?.name).toBe("Eget system");
    expect(findCompetitor("Nej tack")).toBeNull();
  });
});
