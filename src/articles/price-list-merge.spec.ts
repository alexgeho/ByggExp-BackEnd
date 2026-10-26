import {
  buildPriceListOps,
  type PriceListFileType,
  type PriceListRow,
  type StoredPrices,
} from "./price-list-merge";

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
      listPurchasePrice: 10,
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
      netPurchasePrice: 7.56,
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
      listPurchasePrice: 5,
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

  // Tiny in-memory store applying the ops like MongoDB upserts would.
  type Doc = Record<string, unknown>;
  const upload = (
    store: Map<string, Doc>,
    fileType: PriceListFileType,
    rows: PriceListRow[],
  ) => {
    const existing = new Map<string, StoredPrices>(
      [...store].map(([k, d]) => [k, d as StoredPrices]),
    );
    for (const op of buildPriceListOps(
      rows,
      { ...ctx, markupPercent: 25, fileType },
      existing,
    )) {
      const key = op.updateOne.filter.articleNumber;
      const prev = store.get(key);
      store.set(key, {
        ...(prev ? {} : op.updateOne.update.$setOnInsert),
        ...prev,
        ...op.updateOne.update.$set,
      });
    }
  };

  it("main → net → main keeps the net price (order does not matter)", () => {
    const store = new Map<string, Doc>();
    upload(store, "main", [
      { articleNumber: "1", name: "Kabel", unit: "m", purchasePrice: 100 },
      { articleNumber: "2", name: "Dosa", unit: "st", purchasePrice: 20 },
    ]);
    upload(store, "net", [{ articleNumber: "1", purchasePrice: 60 }]);
    upload(store, "main", [
      { articleNumber: "1", name: "Kabel", unit: "m", purchasePrice: 110 },
      { articleNumber: "2", name: "Dosa", unit: "st", purchasePrice: 22 },
    ]);
    expect(store.get("1")).toMatchObject({
      name: "Kabel",
      unit: "m",
      listPurchasePrice: 110,
      netPurchasePrice: 60,
      purchasePriceExclMoms: 60,
      priceExclMoms: 75,
    });
    expect(store.get("2")).toMatchObject({
      listPurchasePrice: 22,
      purchasePriceExclMoms: 22,
      priceExclMoms: 27.5,
    });
  });

  it("net before main gives the same result", () => {
    const store = new Map<string, Doc>();
    upload(store, "net", [{ articleNumber: "1", purchasePrice: 60 }]);
    upload(store, "main", [
      { articleNumber: "1", name: "Kabel", unit: "m", purchasePrice: 110 },
    ]);
    expect(store.get("1")).toMatchObject({
      name: "Kabel",
      listPurchasePrice: 110,
      netPurchasePrice: 60,
      purchasePriceExclMoms: 60,
    });
  });
});
