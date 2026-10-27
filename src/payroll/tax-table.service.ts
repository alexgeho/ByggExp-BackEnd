import { createHash } from "crypto";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { cronsDisabled } from "../common/cron.util";
import {
  TaxTableYear,
  TaxTableYearDocument,
} from "./schemas/tax-table-year.schema";
import {
  TaxTableRow,
  lookupTax,
  parseTaxTableFile,
  validateTaxTables,
} from "./tax-table-file";
import { RuleWatchService } from "./rule-watch.service";

// Monthly preliminary tax (preliminärskatt) from Skatteverket's official
// skattetabell for a table number, column and gross monthly pay.
//
// Tables come from Skatteverket's machine-readable file and are imported per
// income year into Mongo — automatically each November–January (see
// autoImport), or by a superadmin from the admin. When a year has no imported
// table, the legacy env-configured rowstore lookup is tried, and when that is
// unset too, lookup returns null and payroll falls back to the flat
// percentage.
//
// Legacy env (optional): SKV_TAX_ROWSTORE_URL, SKV_TAX_FIELD_TABLE,
// SKV_TAX_FIELD_FROM, SKV_TAX_FIELD_TO, SKV_TAX_COLUMN_PREFIX.

// Skatteverket's page that lists the machine-readable files per year.
const SKV_FILES_PAGE =
  "https://skatteverket.se/specialversionerforprogramforetagmfl.4.319dc1451507f2f99e86ee.html";
const MONTHLY_FILE = /allmanna-tabeller-manad\.txt/i;

type CachedYear = { checksum: string; rows: TaxTableRow[] };

@Injectable()
export class TaxTableService {
  private readonly logger = new Logger(TaxTableService.name);
  private readonly yearCache = new Map<number, CachedYear>();
  // Legacy rowstore cache, per table number for the process lifetime.
  private readonly tableCache = new Map<
    string,
    Array<Record<string, unknown>>
  >();
  private running = false;

  constructor(
    @InjectModel(TaxTableYear.name)
    private taxYearModel: Model<TaxTableYearDocument>,
    private readonly ruleWatch: RuleWatchService,
  ) {}

  // ---- Lookup ---------------------------------------------------------------

  // Returns the monthly tax in SEK, or null to signal "fall back to percentage".
  async lookupMonthlyTax(
    table?: number | null,
    column?: number | null,
    monthlyGross?: number,
    year: number = new Date().getFullYear(),
  ): Promise<number | null> {
    if (!table || !column || !monthlyGross || monthlyGross <= 0) return null;
    const rows = await this.rowsForYear(year);
    if (rows) return lookupTax(rows, table, column, monthlyGross);
    return this.lookupLegacy(table, column, monthlyGross);
  }

  private async rowsForYear(year: number): Promise<TaxTableRow[] | null> {
    const doc = await this.taxYearModel
      .findOne({ year })
      .select("checksum")
      .lean()
      .exec();
    if (!doc) return null;
    const cached = this.yearCache.get(year);
    if (cached && cached.checksum === doc.checksum) return cached.rows;
    const full = await this.taxYearModel.findOne({ year }).lean().exec();
    if (!full) return null;
    const rows = (full.rows || []).map((r) => ({
      table: r[0],
      from: r[1],
      to: r[2] < 0 ? null : r[2],
      percent: r[3] === 1,
      columns: r.slice(4),
    }));
    this.yearCache.set(year, { checksum: full.checksum, rows });
    return rows;
  }

  // ---- Status / import ------------------------------------------------------

  async listYears() {
    return this.taxYearModel
      .find()
      .select("year sourceUrl rowCount importedAt importedBy checksum")
      .sort({ year: -1 })
      .lean()
      .exec();
  }

  // Downloads, parses and validates one year's file; replaces that year only
  // when every check passes.
  async importFromUrl(year: number, url: string, importedBy = "auto") {
    if (!/^https:\/\/(www\.)?skatteverket\.se\//i.test(url)) {
      throw new BadRequestException("Only skatteverket.se files are accepted");
    }
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      throw new BadRequestException("Invalid year");
    }
    const res = await fetch(url);
    if (!res.ok) {
      throw new BadRequestException(`Download failed: HTTP ${res.status}`);
    }
    // The files are Latin-1/UTF-8 ASCII digits; decoding as UTF-8 is safe.
    const text = Buffer.from(await res.arrayBuffer()).toString("utf8");
    const checksum = createHash("sha256").update(text).digest("hex");

    // The same file stored under another year means we picked the wrong link.
    const sameFile = await this.taxYearModel
      .findOne({ checksum, year: { $ne: year } })
      .select("year")
      .lean()
      .exec();
    if (sameFile) {
      throw new BadRequestException(
        `This file is identical to the ${sameFile.year} tables`,
      );
    }

    const rows = parseTaxTableFile(text);
    const problems = validateTaxTables(rows);
    if (problems.length) {
      throw new BadRequestException(
        `Tax table file failed validation: ${problems.slice(0, 5).join("; ")}`,
      );
    }

    await this.taxYearModel
      .findOneAndUpdate(
        { year },
        {
          $set: {
            year,
            sourceUrl: url,
            checksum,
            rowCount: rows.length,
            rows: rows.map((r) => [
              r.table,
              r.from,
              r.to ?? -1,
              r.percent ? 1 : 0,
              ...r.columns,
            ]),
            importedAt: new Date(),
            importedBy,
          },
        },
        { upsert: true },
      )
      .exec();
    this.yearCache.delete(year);
    this.logger.log(`Imported ${rows.length} tax table rows for ${year}`);
    return { year, rowCount: rows.length, sourceUrl: url };
  }

  // Finds the link to `year`'s monthly file on Skatteverket's page: the first
  // monthly-file link after the year is mentioned, before any other year is.
  async discoverFileUrl(year: number): Promise<string | null> {
    const res = await fetch(SKV_FILES_PAGE);
    if (!res.ok) return null;
    const html = await res.text();
    return findMonthlyFileUrl(html, year);
  }

  // Nov–Jan: make sure next year's (or this year's) tables are in place before
  // the first January payroll. Daily at 04:30 in those months.
  @Cron("30 4 * 11,12,1 *")
  async autoImport(): Promise<void> {
    if (cronsDisabled() || this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const year =
        now.getMonth() === 0 ? now.getFullYear() : now.getFullYear() + 1;
      const existing = await this.taxYearModel
        .findOne({ year })
        .select("_id")
        .lean()
        .exec();
      if (existing) return;
      const url = await this.discoverFileUrl(year);
      if (!url) {
        // Normal in early November; a warning only once January has started.
        if (now.getMonth() === 0) {
          await this.ruleWatch.alertSuperadmins(
            `Skattetabeller ${year} saknas`,
            `ByggExp hittade inte skattetabellerna för ${year} på Skatteverkets sida. Importera dem manuellt under Löner → Avtalsregler.`,
          );
        }
        return;
      }
      const result = await this.importFromUrl(year, url);
      await this.ruleWatch.alertSuperadmins(
        `Skattetabeller ${year} importerade`,
        `${result.rowCount} rader importerades automatiskt från ${url}.`,
      );
    } catch (error) {
      this.logger.error("Tax table auto-import failed", error);
      await this.ruleWatch
        .alertSuperadmins(
          "Import av skattetabeller misslyckades",
          `Automatisk import misslyckades: ${String((error as Error)?.message || error)}`,
        )
        .catch(() => undefined);
    } finally {
      this.running = false;
    }
  }

  // ---- Legacy rowstore lookup ----------------------------------------------

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

  private async lookupLegacy(
    table: number,
    column: number,
    monthlyGross: number,
  ): Promise<number | null> {
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

// Exported for tests: picks `year`'s monthly-table link out of the page HTML.
export function findMonthlyFileUrl(html: string, year: number): string | null {
  const links = [...html.matchAll(/href="([^"]+)"/gi)]
    .map((m) => ({ href: m[1], index: m.index ?? 0 }))
    .filter((l) => MONTHLY_FILE.test(l.href));
  for (const link of links) {
    // The nearest year mentioned in the visible text before the link decides
    // which year's section the link belongs to.
    const before = html
      .slice(Math.max(0, link.index - 4000), link.index)
      .replace(/<[^>]+>/g, " ");
    const years = [...before.matchAll(/\b(20\d{2})\b/g)].map((m) =>
      Number(m[1]),
    );
    if (years[years.length - 1] === year) {
      const href = link.href.replace(/&amp;/g, "&");
      return href.startsWith("http")
        ? href
        : `https://www.skatteverket.se${href.startsWith("/") ? "" : "/"}${href}`;
    }
  }
  return null;
}
