import {
  minimumWageFor,
  WageRuleSet,
  buildWorkerWageBasis,
  ruleSetForDate,
  toWageShifts,
} from './wage-basis';
import { buildCsv, buildPaxml } from './wage-export';

// Test figures are made up to keep the arithmetic readable — they are not the
// agreement's real numbers.
const rules = (over: Partial<WageRuleSet> = {}): WageRuleSet => ({
  id: 'r1',
  name: 'Test 2025',
  validFrom: '2025-05-01',
  validTo: '',
  minimumWages: [{ category: 'yrkesarbetare', hourly: 200 }],
  hourTypeSupplements: [
    { hourType: 'overtime', kind: 'percent', value: 50 },
    { hourType: 'ob', kind: 'fixed', value: 30 },
  ],
  vacationPayPercent: 10,
  mileageRatePerKm: 3,
  mileageTaxFreePerKm: 2.5,
  travelTimeRatePerHour: 100,
  perDiemFull: 300,
  perDiemHalf: 150,
  perDiemTaxFreeFull: 290,
  perDiemTaxFreeHalf: 145,
  atkPercent: null,
  ...over,
});

const worker = {
  userId: 'u1',
  name: 'Anna',
  hourlyRate: 250,
  wageCategory: 'yrkesarbetare',
};
const period = { from: '2026-10-01', to: '2026-10-31' };
const amount = (items: Array<{ code: string; amount: number }>, code: string) =>
  items.filter((i) => i.code === code).reduce((s, i) => s + i.amount, 0);

describe('ruleSetForDate', () => {
  it('picks the version in force on the day, latest validFrom first', () => {
    const old = rules({ id: 'old', validFrom: '2023-04-01', validTo: '2025-04-30' });
    const cur = rules({ id: 'cur', validFrom: '2025-05-01' });
    expect(ruleSetForDate([old, cur], '2025-04-30')?.id).toBe('old');
    expect(ruleSetForDate([old, cur], '2025-05-01')?.id).toBe('cur');
    expect(ruleSetForDate([old, cur], '2023-01-01')).toBeNull();
  });
});

describe('buildWorkerWageBasis', () => {
  it('pays base hours and supplements per hour type', () => {
    const b = buildWorkerWageBasis(
      worker,
      [
        { shiftDate: '2026-10-05', hours: 8 },
        { shiftDate: '2026-10-06', hours: 2, hourType: 'overtime' },
        { shiftDate: '2026-10-07', hours: 4, hourType: 'ob' },
      ],
      [],
      [rules({ vacationPayPercent: null })],
      period,
    );
    expect(amount(b.items, 'hours_normal')).toBe(2000);
    expect(amount(b.items, 'hours_overtime')).toBe(500);
    expect(amount(b.items, 'supplement_overtime')).toBe(250); // 2 × 125
    expect(amount(b.items, 'supplement_ob')).toBe(120); // 4 × 30
    expect(b.totals.workedHours).toBe(14);
    expect(b.warnings).toEqual([]);
  });

  it('splits mileage and per diem into tax-free and taxable parts', () => {
    const b = buildWorkerWageBasis(
      worker,
      [{ shiftDate: '2026-10-05', hours: 0, travelKm: 100, perDiem: 'full' }],
      [],
      [rules()],
      period,
    );
    expect(amount(b.items, 'mileage_taxfree')).toBe(250);
    expect(amount(b.items, 'mileage_taxable')).toBe(50);
    expect(amount(b.items, 'per_diem_full_taxfree')).toBe(290);
    expect(amount(b.items, 'per_diem_taxable')).toBe(10);
    expect(b.totals.taxFreeAmount).toBe(540);
    expect(b.totals.taxableAmount).toBe(60);
  });

  it('accrues vacation pay on pay incl. travel time, not on allowances', () => {
    const b = buildWorkerWageBasis(
      worker,
      [{ shiftDate: '2026-10-05', hours: 8, travelMinutes: 60, travelKm: 10 }],
      [],
      [rules()],
      period,
    );
    // (8 × 250 + 1 × 100) × 10 %
    expect(amount(b.items, 'vacation_pay')).toBe(210);
  });

  it('reports approved absence as hours on weekdays inside the period', () => {
    const b = buildWorkerWageBasis(
      worker,
      [],
      [
        // Fri 2026-09-30 is outside; Sat/Sun 3–4 Oct are skipped.
        { type: 'sick', startDate: '2026-09-30', endDate: '2026-10-05' },
        { type: 'vacation', startDate: '2026-10-12', endDate: '2026-10-12', halfDay: true },
      ],
      [rules()],
      period,
    );
    const sick = b.items.filter((i) => i.code === 'absence_sick');
    expect(sick.map((i) => i.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-05']);
    expect(b.items.find((i) => i.code === 'absence_vacation')?.quantity).toBe(4);
    expect(b.totals.absenceHours).toBe(28);
  });

  it('warns when the wage is below the agreement minimum or rules are missing', () => {
    const low = buildWorkerWageBasis(
      { ...worker, hourlyRate: 180 },
      [{ shiftDate: '2026-10-05', hours: 8 }],
      [],
      [rules()],
      period,
    );
    expect(low.warnings.map((w) => w.code)).toContain('below_minimum_wage');

    const none = buildWorkerWageBasis(
      worker,
      [{ shiftDate: '2026-10-05', hours: 8, hourType: 'overtime', perDiem: 'full' }],
      [],
      [],
      period,
    );
    expect(none.warnings.map((w) => w.code)).toContain('missing_rule_set');
    // Base pay still counts; nothing agreement-based is invented.
    expect(amount(none.items, 'hours_overtime')).toBe(2000);
    expect(none.items.some((i) => i.code.startsWith('per_diem'))).toBe(false);
    expect(none.items.some((i) => i.code.startsWith('supplement'))).toBe(false);
  });
});

describe('toWageShifts', () => {
  const H = 3_600_000;

  it('pays approved övertid inside the day as its own overtime part', () => {
    const parts = toWageShifts({
      shiftDate: '2026-10-20',
      manualDurationMs: 10 * H,
      overtimeMs: 2 * H,
      overtimeStatus: 'approved',
      travelKm: 30,
    });
    expect(parts).toEqual([
      expect.objectContaining({ hours: 8, hourType: undefined, travelKm: 30 }),
      expect.objectContaining({ hours: 2, hourType: 'overtime' }),
    ]);
    expect(parts[1].travelKm).toBeUndefined();

    const b = buildWorkerWageBasis(
      worker,
      parts,
      [],
      [rules({ vacationPayPercent: null })],
      period,
    );
    expect(amount(b.items, 'hours_normal')).toBe(2000); // 8 × 250
    expect(amount(b.items, 'hours_overtime')).toBe(500); // 2 × 250
    expect(amount(b.items, 'supplement_overtime')).toBe(250); // 2 × 125
  });

  it('keeps pending övertid in the day, as normal hours', () => {
    const parts = toWageShifts({
      shiftDate: '2026-10-21',
      manualDurationMs: 9.5 * H,
      overtimeMs: 1.5 * H,
      overtimeStatus: 'pending',
    });
    expect(parts).toHaveLength(1);
    expect(parts[0].hours).toBe(9.5);
  });

  it('falls back to GPS hours and never splits off more than the day has', () => {
    const parts = toWageShifts({
      shiftDate: '2026-10-22',
      durationMs: 3 * H,
      manualDurationMs: null,
      overtimeMs: 5 * H,
      overtimeStatus: 'approved',
    });
    expect(parts.map((p) => p.hours)).toEqual([0, 3]);
  });

  it('pays approved OB inside the day as its own OB part, next to övertid', () => {
    const parts = toWageShifts({
      shiftDate: '2026-10-21',
      manualDurationMs: 10 * H,
      overtimeMs: 2 * H,
      overtimeStatus: 'approved',
      obMs: 3 * H,
      obStatus: 'approved',
      perDiem: 'half',
    });
    expect(parts).toEqual([
      expect.objectContaining({ hours: 5, perDiem: 'half' }),
      expect.objectContaining({ hours: 2, hourType: 'overtime' }),
      expect.objectContaining({ hours: 3, hourType: 'ob' }),
    ]);
    expect(parts[2].perDiem).toBeUndefined();
  });

  it('keeps pending OB in the day and caps OB to the hours left after övertid', () => {
    expect(
      toWageShifts({
        shiftDate: '2026-10-21',
        manualDurationMs: 8 * H,
        obMs: 2 * H,
        obStatus: 'pending',
      }).map((p) => p.hours),
    ).toEqual([8]);
    expect(
      toWageShifts({
        shiftDate: '2026-10-21',
        manualDurationMs: 8 * H,
        overtimeMs: 6 * H,
        overtimeStatus: 'approved',
        obMs: 5 * H,
        obStatus: 'approved',
      }).map((p) => p.hours),
    ).toEqual([0, 6, 2]);
  });
});

describe('buildPaxml', () => {
  it('writes mapped salary and absence transactions and reports the rest', () => {
    const b = buildWorkerWageBasis(
      worker,
      [{ shiftDate: '2026-10-05', hours: 8, hourType: 'ob' }],
      [{ type: 'sick', startDate: '2026-10-06', endDate: '2026-10-06' }],
      [rules({ vacationPayPercent: null })],
      period,
    );
    const { content: xml, skipped, salaryCount, absenceCount } = buildPaxml({
      companyName: 'Bygg & Co',
      orgNumber: '556000-0000',
      generatedAt: new Date('2026-10-22T10:00:00Z'),
      workers: [{ ...b, employeeId: '7' }],
      salaryCodes: { hours_ob: '11' },
      absenceCodes: { absence_sick: 'SJK' },
    });
    expect(salaryCount).toBe(1);
    expect(absenceCount).toBe(1);
    expect(xml).toContain('<foretagnamn>Bygg &amp; Co</foretagnamn>');
    expect(xml).toContain('<lonetrans anstid="7">');
    expect(xml).toContain('<lonart>11</lonart>');
    expect(xml).toContain('<belopp>2000.00</belopp>');
    expect(xml).toContain('<tidkod>SJK</tidkod>');
    expect(skipped).toEqual([
      { userId: 'u1', name: 'Anna', code: 'supplement_ob', reason: 'no_code' },
    ]);
  });

  it('skips a worker without an employee number in the payroll system', () => {
    const { skipped, salaryCount } = buildPaxml({
      companyName: 'X',
      orgNumber: '',
      generatedAt: new Date(),
      workers: [
        {
          userId: 'u1',
          name: 'Anna',
          employeeId: '',
          items: [
            {
              code: 'hours_normal',
              label: 'Timlön',
              kind: 'salary',
              date: '2026-10-05',
              quantity: 1,
              unit: 'h',
              unitPrice: 1,
              amount: 1,
              taxFree: false,
            },
          ],
        },
      ],
      salaryCodes: { hours_normal: '11' },
      absenceCodes: {},
    });
    expect(salaryCount).toBe(0);
    expect(skipped[0].reason).toBe('no_employee_id');
  });
});

describe('buildCsv', () => {
  it('writes a Swedish-Excel spreadsheet with the same mapped rows', () => {
    const b = buildWorkerWageBasis(
      { ...worker, name: 'Anna; "Ann" Svensson' },
      [{ shiftDate: '2026-10-05', hours: 7.5, travelKm: 10 }],
      [{ type: 'vab', startDate: '2026-10-06', endDate: '2026-10-06' }],
      [rules({ vacationPayPercent: 10 })],
      period,
    );
    const { content, skipped, salaryCount, absenceCount } = buildCsv({
      companyName: 'X',
      orgNumber: '',
      generatedAt: new Date(),
      workers: [{ ...b, employeeId: '7' }],
      salaryCodes: { hours_normal: '11', vacation_pay: '41', mileage_taxfree: '61' },
      absenceCodes: { absence_vab: 'VAB' },
    });
    const lines = content.replace(/^﻿/, '').trim().split('\r\n');
    expect(content.startsWith('﻿')).toBe(true);
    expect(lines[0]).toBe(
      'Anställningsnr;Namn;Datum;Typ;Löneart/Frånvarokod;Benämning;Antal;Enhet;À-pris;Belopp',
    );
    expect(lines).toContain(
      '7;"Anna; ""Ann"" Svensson";2026-10-05;Lön;11;Timlön;7,50;tim;250,00;1875,00',
    );
    expect(lines).toContain(
      '7;"Anna; ""Ann"" Svensson";2026-10-06;Frånvaro;VAB;VAB;8,00;tim;;',
    );
    // Semesterersättning is an amount only: 1875 × 10 %.
    expect(lines.some((l) => l.includes(';41;') && l.endsWith(';;;187,50'))).toBe(true);
    expect(salaryCount).toBe(3);
    expect(absenceCount).toBe(1);
    expect(skipped.map((s) => s.code)).toEqual(['mileage_taxable']);
  });
});

describe('minimumWageFor', () => {
  const rules = {
    minimumWages: [
      { category: 'yrkesarbetare', hourly: 203 },
      { category: 'ny_i_branschen', hourly: 142.1 },
    ],
  };
  it('uses the category the version lists', () => {
    expect(minimumWageFor(rules, 'ny_i_branschen')).toBe(142.1);
  });
  it('derives Övriga 1 from grundlön × 0,88', () => {
    expect(minimumWageFor(rules, 'ovriga_1')).toBe(178.64);
  });
  it('returns null when nothing applies', () => {
    expect(minimumWageFor(rules, 'larling')).toBeNull();
    expect(minimumWageFor(rules, null)).toBeNull();
  });
});
