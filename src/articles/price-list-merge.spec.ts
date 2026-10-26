import { buildPriceListOps } from "./price-list-merge";

const ctx = { companyId: "c1", userId: "u1", supplier: "Lundagrossisten" };

describe("price list merge", () => {
  it("main sets name, unit and prices (markup on purchase)", () => {
    const [op] = buildPriceListOps(
      [{ articleNumber: " 42 ", name: "Dosa", unit: "", purchasePrice: 10 }],
      { ...ctx, markupPercent: 20 },
    );
    expect(op.updateOne.filter).toEqual({
      companyId: "c1",
      supplier: "Lundagrossisten",
      articleNumber: "42",
    });
    expect(op.updateOne.update.$set).toEqual({
      name: "Dosa",
      unit: "st",
      purchasePriceExclMoms: 10,
      priceExclMoms: 12,
    });
    expect(op.updateOne.upsert).toBe(true);
  });

  it("net overrides prices but keeps name/unit when the file has none", () => {
    const [op] = buildPriceListOps(
      [{ articleNumber: "42", purchasePrice: 7.555 }],
      { ...ctx, markupPercent: 10, fileType: "net" },
    );
    expect(op.updateOne.update.$set).toEqual({
      purchasePriceExclMoms: 7.56,
      priceExclMoms: 8.32,
    });
    // Missing articles are inserted with defaults.
    expect(op.updateOne.update.$setOnInsert).toMatchObject({
      name: "",
      unit: "st",
      active: true,
    });
    expect(op.updateOne.upsert).toBe(true);
  });

  it("copper updates prices and name/unit when given", () => {
    const [op] = buildPriceListOps(
      [{ articleNumber: "9", name: "EKK 3G1,5", unit: "m", purchasePrice: 5 }],
      { ...ctx, fileType: "copper" },
    );
    expect(op.updateOne.update.$set).toEqual({
      name: "EKK 3G1,5",
      unit: "m",
      purchasePriceExclMoms: 5,
      priceExclMoms: 5,
    });
    expect(op.updateOne.update.$setOnInsert).not.toHaveProperty("name");
  });

  it("skips rows without article number", () => {
    expect(
      buildPriceListOps([{ articleNumber: " ", purchasePrice: 1 }], ctx),
    ).toEqual([]);
  });
});
