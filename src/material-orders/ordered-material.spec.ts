import { orderValue, orderedMaterialCost } from "./ordered-material";

describe("ordered material cost", () => {
  const draft = {
    _id: "a",
    status: "draft",
    rows: [
      { quantity: 10, unitPrice: 12.5 },
      { quantity: 2, unitPrice: 100 },
    ],
  };
  const sent = {
    _id: "b",
    status: "sent",
    rows: [{ quantity: 3, unitPrice: 50 }],
  };

  it("counts draft and sent orders", () => {
    expect(orderedMaterialCost([draft, sent])).toEqual({
      total: 475,
      count: 2,
      invoicedCount: 0,
    });
  });

  it("excludes orders linked to a supplier invoice", () => {
    expect(orderedMaterialCost([draft, sent], ["b"])).toEqual({
      total: 325,
      count: 1,
      invoicedCount: 1,
    });
  });

  it("treats a missing unitPrice or quantity as 0", () => {
    expect(
      orderValue({
        rows: [
          { quantity: 4 },
          { unitPrice: 9 },
          { quantity: 2, unitPrice: null },
        ],
      }),
    ).toBe(0);
    expect(
      orderedMaterialCost([{ _id: "c" }, { _id: "d", rows: null }]).total,
    ).toBe(0);
  });

  it("rounds to öre", () => {
    expect(
      orderValue({
        rows: [
          { quantity: 0.1, unitPrice: 0.2 },
          { quantity: 0.2, unitPrice: 0.1 },
        ],
      }),
    ).toBe(0.04);
  });
});
