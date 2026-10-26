// Grossist price files (Mowin model, Lundagrossisten): the admin downloads
// them from the grossist's customer login and uploads them here.
//  main   — Huvudprislista: full catalogue, sets name/unit/prices.
//  net    — Nettoprislista: agreed net prices; overrides the purchase price of
//           the articles it lists (missing ones are inserted).
//  copper — Kopparpriser: copper-indexed per-piece prices; same merge as net.
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

const round2 = (n: number) => Math.round(n * 100) / 100;

// One bulkWrite upsert per row with a non-empty article number.
export function buildPriceListOps(rows: PriceListRow[], ctx: Ctx) {
  const fileType = ctx.fileType || "main";
  const factor = 1 + (Number(ctx.markupPercent) || 0) / 100;
  return rows
    .filter((r) => r.articleNumber?.trim())
    .map((r) => {
      const purchase = round2(Number(r.purchasePrice) || 0);
      const name = (r.name || "").trim();
      const unit = (r.unit || "").trim();
      const $set: Record<string, unknown> = {
        purchasePriceExclMoms: purchase,
        priceExclMoms: round2(purchase * factor),
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
            articleNumber: r.articleNumber.trim(),
          },
          update: { $set, $setOnInsert },
          upsert: true,
        },
      };
    });
}
