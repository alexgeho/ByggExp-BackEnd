// "Beställt material" in a project's economy: every material order (draft and
// sent) counts as cost the moment it is made — quantity × unitPrice per row.
// An order linked to a supplier invoice stops counting here, because the
// invoice amount already carries that cost (no double counting).
// One helper so the admin and the mobile app show the same number.

export type CostedOrderRow = {
  quantity?: number | null;
  unitPrice?: number | null;
};
export type CostedOrder = { _id?: unknown; rows?: CostedOrderRow[] | null };

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function orderValue(order: CostedOrder): number {
  return round2(
    (order.rows || []).reduce(
      (s, r) => s + (Number(r?.quantity) || 0) * (Number(r?.unitPrice) || 0),
      0,
    ),
  );
}

export function orderedMaterialCost(
  orders: CostedOrder[],
  invoicedOrderIds: Iterable<string> = [],
): { total: number; count: number; invoicedCount: number } {
  const invoiced = new Set(Array.from(invoicedOrderIds, String));
  let total = 0;
  let count = 0;
  let invoicedCount = 0;
  for (const o of orders || []) {
    if (invoiced.has(String(o._id))) {
      invoicedCount += 1;
      continue;
    }
    total += orderValue(o);
    count += 1;
  }
  return { total: round2(total), count, invoicedCount };
}
