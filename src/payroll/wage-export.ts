// Export of a lönerunderlag to the company's payroll system. Every item is
// first mapped to the company's löneart / frånvarokod; items without a code (or
// workers without an employee number) are skipped and returned so the caller
// can tell the user. The mapped rows are then written as:
//   - PAXml 2.0: the common Swedish import format (Fortnox, Visma, Hogia, Crona …)
//   - CSV: a plain spreadsheet for a system without PAXml import.
import type { WageItem, WorkerWageBasis } from './wage-basis';

export type ExportInput = {
  companyName: string;
  orgNumber: string;
  generatedAt: Date;
  workers: Array<
    Pick<WorkerWageBasis, 'userId' | 'name' | 'items'> & {
      employeeId: string; // anställningsnummer in the payroll system
    }
  >;
  salaryCodes: Record<string, string>;
  absenceCodes: Record<string, string>;
};

export type ExportSkipped = {
  userId: string;
  name: string;
  code: string;
  reason: 'no_employee_id' | 'no_code';
};

export type ExportRow = {
  employeeId: string;
  name: string;
  code: string; // löneart or frånvarokod
  item: WageItem;
};

export function collectExportRows(input: ExportInput): {
  salary: ExportRow[];
  absence: ExportRow[];
  skipped: ExportSkipped[];
} {
  const salary: ExportRow[] = [];
  const absence: ExportRow[] = [];
  const skipped: ExportSkipped[] = [];
  const skippedKeys = new Set<string>();
  const skip = (s: ExportSkipped) => {
    const key = `${s.userId}|${s.code}|${s.reason}`;
    if (skippedKeys.has(key)) return;
    skippedKeys.add(key);
    skipped.push(s);
  };

  for (const worker of input.workers) {
    const employeeId = String(worker.employeeId || '').trim();
    if (!employeeId) {
      if (worker.items.length) {
        skip({ userId: worker.userId, name: worker.name, code: '*', reason: 'no_employee_id' });
      }
      continue;
    }
    for (const item of worker.items) {
      const isAbsence = item.kind === 'absence';
      const code = String(
        (isAbsence ? input.absenceCodes : input.salaryCodes)[item.code] || '',
      ).trim();
      if (!code) {
        skip({ userId: worker.userId, name: worker.name, code: item.code, reason: 'no_code' });
        continue;
      }
      const row = { employeeId, name: worker.name, code, item };
      if (isAbsence) absence.push(row);
      else if (item.amount) salary.push(row);
    }
  }
  return { salary, absence, skipped };
}

// ---- PAXml ---------------------------------------------------------------

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const num = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

function salaryTrans({ employeeId, code, item }: ExportRow) {
  // Accruals (semesterersättning, ATK) are plain amounts; everything else is
  // quantity × unit price.
  const amountOnly = item.unit === 'sek';
  return [
    `    <lonetrans anstid="${esc(employeeId)}">`,
    `      <lonart>${esc(code)}</lonart>`,
    `      <datum>${esc(item.date)}</datum>`,
    ...(amountOnly
      ? []
      : [
          `      <antal>${num(item.quantity)}</antal>`,
          `      <apris>${num(item.unitPrice)}</apris>`,
        ]),
    `      <belopp>${num(item.amount)}</belopp>`,
    `    </lonetrans>`,
  ].join('\n');
}

function timeTrans({ employeeId, code, item }: ExportRow) {
  return [
    `    <tidtrans anstid="${esc(employeeId)}">`,
    `      <tidkod>${esc(code)}</tidkod>`,
    `      <datum>${esc(item.date)}</datum>`,
    `      <timmar>${num(item.quantity)}</timmar>`,
    `    </tidtrans>`,
  ].join('\n');
}

export function buildPaxml(input: ExportInput) {
  const { salary, absence, skipped } = collectExportRows(input);
  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<paxml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.paxml.se/2.0/paxml.xsd">',
    '  <header>',
    '    <format>LÖNIN</format>',
    '    <version>2.0</version>',
    `    <datum>${input.generatedAt.toISOString().slice(0, 19)}</datum>`,
    `    <foretagnamn>${esc(input.companyName)}</foretagnamn>`,
    `    <foretagorgnr>${esc(input.orgNumber)}</foretagorgnr>`,
    '  </header>',
    ...(salary.length
      ? ['  <lonetransaktioner>', ...salary.map(salaryTrans), '  </lonetransaktioner>']
      : []),
    ...(absence.length
      ? ['  <tidtransaktioner>', ...absence.map(timeTrans), '  </tidtransaktioner>']
      : []),
    '</paxml>',
    '',
  ].join('\n');
  return {
    content: xml,
    skipped,
    salaryCount: salary.length,
    absenceCount: absence.length,
  };
}

// ---- CSV -----------------------------------------------------------------

// Swedish Excel conventions: semicolon separator, decimal comma, UTF-8 BOM.
const csvCell = (value: unknown) => {
  const s = String(value ?? '');
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvNum = (n: number) => num(n).replace('.', ',');

export function buildCsv(input: ExportInput) {
  const { salary, absence, skipped } = collectExportRows(input);
  const header = [
    'Anställningsnr',
    'Namn',
    'Datum',
    'Typ',
    'Löneart/Frånvarokod',
    'Benämning',
    'Antal',
    'Enhet',
    'À-pris',
    'Belopp',
  ];
  const unit = { h: 'tim', km: 'km', day: 'dag', sek: 'kr' } as const;
  const rows = [...salary, ...absence]
    .sort((a, b) =>
      a.employeeId === b.employeeId
        ? a.item.date.localeCompare(b.item.date)
        : a.employeeId.localeCompare(b.employeeId, 'sv', { numeric: true }),
    )
    .map(({ employeeId, name, code, item }) => {
      const amountOnly = item.unit === 'sek';
      const isAbsence = item.kind === 'absence';
      return [
        employeeId,
        name,
        item.date,
        isAbsence ? 'Frånvaro' : 'Lön',
        code,
        item.label,
        amountOnly ? '' : csvNum(item.quantity),
        amountOnly ? '' : unit[item.unit],
        amountOnly || isAbsence ? '' : csvNum(item.unitPrice),
        isAbsence ? '' : csvNum(item.amount),
      ];
    });
  const content =
    '﻿' +
    [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') +
    '\r\n';
  return {
    content,
    skipped,
    salaryCount: salary.length,
    absenceCount: absence.length,
  };
}
