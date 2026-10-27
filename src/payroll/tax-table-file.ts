// Skatteverket's machine-readable monthly tax tables ("allmänna tabeller,
// månadslön", the .txt under "Specialversioner för programföretag"). Fixed-width
// rows, e.g.
//   30B31  30001  30200 5575 5445 2419 5575 8617 8617
//   30%421327801          61   61   61   51   61   61
// [0,2) period code (30 = month) · [2] B = tax in kronor, % = percent of the
// income · [3,5) table number · [5,12) income from · [12,19) income to (blank
// = no upper bound) · then columns 1–6, five characters each.

export type TaxTableRow = {
  table: number;
  from: number;
  to: number | null;
  percent: boolean;
  columns: number[]; // index 0 = kolumn 1
};

// Digits only — parseInt would quietly read "3000X" as 3000.
const int = (s: string): number => (/^\d+$/.test(s) ? Number(s) : NaN);

export function parseTaxTableFile(text: string): TaxTableRow[] {
  const rows: TaxTableRow[] = [];
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (line.length < 24) continue;
    if (line.slice(0, 2) !== "30") continue; // monthly rows only
    const kind = line[2];
    if (kind !== "B" && kind !== "%") continue;
    const table = int(line.slice(3, 5));
    const from = int(line.slice(5, 12).trim());
    const toText = line.slice(12, 19).trim();
    const to = toText ? int(toText) : null;
    const columns: number[] = [];
    for (let i = 19; i < line.length && columns.length < 6; i += 5) {
      const cell = line.slice(i, i + 5).trim();
      if (!cell) break;
      columns.push(int(cell));
    }
    if (
      !Number.isFinite(table) ||
      !Number.isFinite(from) ||
      (to != null && !Number.isFinite(to)) ||
      !columns.length ||
      columns.some((c) => !Number.isFinite(c))
    ) {
      throw new Error(`Unreadable tax table row: "${line}"`);
    }
    rows.push({ table, from, to, percent: kind === "%", columns });
  }
  return rows;
}

// Monthly preliminary tax in SEK, or null when the table/column/income is not
// covered.
export function lookupTax(
  rows: TaxTableRow[],
  table: number,
  column: number,
  monthlyGross: number,
): number | null {
  if (!table || !column || column < 1 || column > 6) return null;
  const income = Math.floor(Number(monthlyGross) || 0);
  if (income <= 0) return 0;
  const row = rows.find(
    (r) =>
      r.table === table && income >= r.from && (r.to == null || income <= r.to),
  );
  const value = row?.columns[column - 1];
  if (row == null || value == null) return null;
  return row.percent ? Math.round((income * value) / 100) : value;
}

// Sanity checks before a downloaded file replaces anything: every table
// 29–42 present, brackets contiguous and tax never falling as income rises.
// Returns the problems found; an empty list means the file is usable.
export function validateTaxTables(rows: TaxTableRow[]): string[] {
  const problems: string[] = [];
  if (rows.length < 1000) problems.push(`Only ${rows.length} rows`);
  for (let table = 29; table <= 42; table++) {
    const own = rows
      .filter((r) => r.table === table)
      .sort((a, b) => a.from - b.from);
    if (!own.length) {
      problems.push(`Table ${table} is missing`);
      continue;
    }
    if (own[own.length - 1].to != null) {
      problems.push(`Table ${table} has no open-ended top bracket`);
    }
    for (let i = 1; i < own.length; i++) {
      const prev = own[i - 1];
      if (prev.to == null || own[i].from !== prev.to + 1) {
        problems.push(`Table ${table} has a gap or overlap at ${own[i].from}`);
        break;
      }
    }
    // Kronor rows: column 1 tax must not decrease bracket to bracket.
    const kronor = own.filter((r) => !r.percent);
    for (let i = 1; i < kronor.length; i++) {
      if (kronor[i].columns[0] < kronor[i - 1].columns[0]) {
        problems.push(`Table ${table} tax decreases at ${kronor[i].from}`);
        break;
      }
    }
  }
  return problems;
}
