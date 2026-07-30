import { Injectable, Logger } from "@nestjs/common";

// Looks up the monthly preliminary tax (preliminärskatt) from Skatteverket's
// official skattetabell for a given table number, column and gross monthly pay.
//
// Data comes from Skatteverket's open "rowstore" dataset — configured via env so
// the correct (current-year) dataset and field names can be set without code
// changes, and so we never ship guessed/fabricated tax figures:
//   SKV_TAX_ROWSTORE_URL   base dataset URL (required to enable table-based tax)
//   SKV_TAX_FIELD_TABLE    field for table number   (default "tabellnr")
//   SKV_TAX_FIELD_FROM     field for income from     (default "inkomst fr.o.m.")
//   SKV_TAX_FIELD_TO       field for income to       (default "inkomst t.o.m.")
//   SKV_TAX_COLUMN_PREFIX  prefix for column fields  (default "kolumn ")
//
// When unset or on any failure, lookup returns null and payroll falls back to
// the flat percentage — so behaviour is safe and unchanged until configured and
// verified against Skatteverket's tables (do confirm with an accountant).
@Injectable()
export class TaxTableService {
  private readonly logger = new Logger(TaxTableService.name);
  // Cache all rows per table number for the process lifetime.
  private readonly tableCache = new Map<
    string,
    Array<Record<string, unknown>>
  >();

  private num(value: unknown): number | null {
    if (value == null) return null;
    const n = parseFloat(String(value).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  private async fetchTableRows(
    table: number,
  ): Promise<Array<Record<string, unknown>>> {
    const cacheKey = String(table);
    const cached = this.tableCache.get(cacheKey);
    if (cached) return cached;

    const base = process.env.SKV_TAX_ROWSTORE_URL;
    if (!base) return [];

    const tableField = process.env.SKV_TAX_FIELD_TABLE || "tabellnr";
    const sep = base.includes("?") ? "&" : "?";
    const url = `${base}${sep}${encodeURIComponent(tableField)}=${table}&_limit=2000`;

    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { results?: unknown };
      const rows = Array.isArray(data?.results)
        ? (data.results as Array<Record<string, unknown>>)
        : [];
      this.tableCache.set(cacheKey, rows);
      return rows;
    } catch (error) {
      this.logger.warn(
        `Tax-table lookup failed for table ${table}: ${String(error)}`,
      );
      this.tableCache.set(cacheKey, []);
      return [];
    }
  }

  // Returns the monthly tax in SEK, or null to signal "fall back to percentage".
  async lookupMonthlyTax(
    table?: number | null,
    column?: number | null,
    monthlyGross?: number,
  ): Promise<number | null> {
    if (!table || !column || !monthlyGross || monthlyGross <= 0) return null;
    if (!process.env.SKV_TAX_ROWSTORE_URL) return null;

    const rows = await this.fetchTableRows(table);
    if (!rows.length) return null;

    const fromField = process.env.SKV_TAX_FIELD_FROM || "inkomst fr.o.m.";
    const toField = process.env.SKV_TAX_FIELD_TO || "inkomst t.o.m.";
    const columnField =
      (process.env.SKV_TAX_COLUMN_PREFIX || "kolumn ") + String(column);

    const gross = Math.round(monthlyGross);
    const match = rows.find((row) => {
      const from = this.num(row[fromField]);
      const to = this.num(row[toField]);
      if (from == null || to == null) return false;
      return gross >= from && gross <= to;
    });
    if (!match) return null;

    const tax = this.num(match[columnField]);
    return tax == null ? null : tax;
  }
}
