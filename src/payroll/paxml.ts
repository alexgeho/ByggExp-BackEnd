// PAXml 2.0 export of a lönerunderlag, for import into Fortnox Lön
// (Lön → Importera → PAXml). Salary items become <lonetrans> with the company's
// löneart, absence becomes <tidtrans> with a frånvarokod. Items without a
// mapped code are skipped and returned so the caller can tell the user.
import type { WageItem, WorkerWageBasis } from './wage-basis';

export type PaxmlInput = {
  companyName: string;
  orgNumber: string;
  generatedAt: Date;
  workers: Array<
    Pick<WorkerWageBasis, 'userId' | 'name' | 'items'> & {
      employeeId: string; // Fortnox anställningsnummer
    }
  >;
  salaryCodes: Record<string, string>;
  absenceCodes: Record<string, string>;
};

export type PaxmlSkipped = {
  userId: string;
  name: string;
  code: string;
  reason: 'no_employee_id' | 'no_code';
};

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const num = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

const localDateTime = (d: Date) => d.toISOString().slice(0, 19);

function salaryTrans(employeeId: string, lonart: string, item: WageItem) {
  // Accruals (semesterersättning, ATK) are plain amounts; everything else is
  // quantity × unit price.
  const amountOnly = item.unit === 'sek';
  return [
    `    <lonetrans anstid="${esc(employeeId)}">`,
    `      <lonart>${esc(lonart)}</lonart>`,
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

function timeTrans(employeeId: string, tidkod: string, item: WageItem) {
  return [
    `    <tidtrans anstid="${esc(employeeId)}">`,
    `      <tidkod>${esc(tidkod)}</tidkod>`,
    `      <datum>${esc(item.date)}</datum>`,
    `      <timmar>${num(item.quantity)}</timmar>`,
    `    </tidtrans>`,
  ].join('\n');
}

export function buildPaxml(input: PaxmlInput): {
  xml: string;
  skipped: PaxmlSkipped[];
  salaryCount: number;
  absenceCount: number;
} {
  const salary: string[] = [];
  const absence: string[] = [];
  const skipped: PaxmlSkipped[] = [];
  const skippedKeys = new Set<string>();
  const skip = (s: PaxmlSkipped) => {
    const key = `${s.userId}|${s.code}|${s.reason}`;
    if (skippedKeys.has(key)) return;
    skippedKeys.add(key);
    skipped.push(s);
  };

  for (const worker of input.workers) {
    const employeeId = String(worker.employeeId || '').trim();
    for (const item of worker.items) {
      if (!employeeId) {
        skip({ userId: worker.userId, name: worker.name, code: '*', reason: 'no_employee_id' });
        break;
      }
      const isAbsence = item.kind === 'absence';
      const code = String(
        (isAbsence ? input.absenceCodes : input.salaryCodes)[item.code] || '',
      ).trim();
      if (!code) {
        skip({ userId: worker.userId, name: worker.name, code: item.code, reason: 'no_code' });
        continue;
      }
      if (isAbsence) absence.push(timeTrans(employeeId, code, item));
      else if (item.amount) salary.push(salaryTrans(employeeId, code, item));
    }
  }

  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<paxml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.paxml.se/2.0/paxml.xsd">',
    '  <header>',
    '    <format>LÖNIN</format>',
    '    <version>2.0</version>',
    `    <datum>${localDateTime(input.generatedAt)}</datum>`,
    `    <foretagnamn>${esc(input.companyName)}</foretagnamn>`,
    `    <foretagorgnr>${esc(input.orgNumber)}</foretagorgnr>`,
    '  </header>',
    ...(salary.length
      ? ['  <lonetransaktioner>', ...salary, '  </lonetransaktioner>']
      : []),
    ...(absence.length
      ? ['  <tidtransaktioner>', ...absence, '  </tidtransaktioner>']
      : []),
    '</paxml>',
    '',
  ].join('\n');

  return { xml, skipped, salaryCount: salary.length, absenceCount: absence.length };
}
