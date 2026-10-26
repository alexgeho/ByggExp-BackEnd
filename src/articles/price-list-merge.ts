// Grossist price files (Mowin model, Lundagrossisten): the admin downloads
// them from the grossist's customer login and uploads them here.
//  main   — Huvudprislista: full catalogue, sets name/unit/prices.
//  net    — Nettoprislista: agreed net prices for the articles it lists
//           (missing ones are inserted).
//  copper — Kopparpriser: copper-indexed per-piece list prices.
// List price (main/copper) and net price are stored apart, so upload order
// does not matter: purchasePriceExclMoms = net ?? list, and the sale price is
// recomputed from it with the markup.
export const PRICE_LIST_FILE_TYPES = ["main", "net", "copper"] as const;
export type PriceListFileType = (typeof PRICE_LIST_FILE_TYPES)[number];

export type PriceListRow = {
  articleNumber: string;
  name?: string;
  unit?: string;
  purchasePrice: number;
};

type Ctx = {
  companyId: string;
  userId?: string;
  supplier: string;
  markupPercent?: number;
  fileType?: PriceListFileType;
};

export type StoredPrices = {
  listPurchasePrice?: number | null;
  netPurchasePrice?: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// One bulkWrite upsert per row with a non-empty article number. `existing`
// holds the stored list/net prices by article number (for this supplier).
export function buildPriceListOps(
  rows: PriceListRow[],
  ctx: Ctx,
  existing: Map<string, StoredPrices> = new Map(),
) {
  const fileType = ctx.fileType || "main";
  const factor = 1 + (Number(ctx.markupPercent) || 0) / 100;
  return rows
    .filter((r) => r.articleNumber?.trim())
    .map((r) => {
      const articleNumber = r.articleNumber.trim();
      const purchase = round2(Number(r.purchasePrice) || 0);
      const name = (r.name || "").trim();
      const unit = (r.unit || "").trim();
      const stored = existing.get(articleNumber);
      const isNet = fileType === "net";
      const list = isNet ? stored?.listPurchasePrice : purchase;
      const net = isNet ? purchase : stored?.netPurchasePrice;
      const effective = net ?? list ?? 0;
      const $set: Record<string, unknown> = {
        [isNet ? "netPurchasePrice" : "listPurchasePrice"]: purchase,
        purchasePriceExclMoms: effective,
        priceExclMoms: round2(effective * factor),
      };
      const $setOnInsert: Record<string, unknown> = {
        createdByUserId: ctx.userId,
        kontering: "Varor 25%",
        momsPercent: 25,
        active: true,
      };
      if (fileType === "main") {
        $set.name = name;
        $set.unit = unit || "st";
      } else {
        // Net/copper files may lack name/unit: never blank out what the
        // Huvudprislista set.
        if (name) $set.name = name;
        else $setOnInsert.name = "";
        if (unit) $set.unit = unit;
        else $setOnInsert.unit = "st";
      }
      return {
        updateOne: {
          filter: {
            companyId: ctx.companyId,
            supplier: ctx.supplier,
            articleNumber,
          },
          update: { $set, $setOnInsert },
          upsert: true,
        },
      };
    });
}
