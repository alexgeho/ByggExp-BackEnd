// Lönerunderlag: turns a worker's attested shifts and approved absence for a
// period into dated pay items under the collective agreement version in force
// on each day. Pure functions only — the service loads the data, this decides
// the numbers, so every rule is unit-testable.
import { round2 } from './payroll-math';

export type WageRuleSet = {
  id: string;
  name: string;
  validFrom: string; // YYYY-MM-DD inclusive
  validTo?: string; // YYYY-MM-DD inclusive, '' = open-ended
  minimumWages: Array<{ category: string; hourly: number }>;
  hourTypeSupplements: Array<{
    hourType: string;
    label?: string;
    kind: 'percent' | 'fixed';
    value: number;
  }>;
  vacationPayPercent: number | null;
  mileageRatePerKm: number;
  mileageTaxFreePerKm: number;
  travelTimeRatePerHour: number;
  perDiemFull: number;
  perDiemHalf: number;
  perDiemTaxFreeFull: number;
  perDiemTaxFreeHalf: number;
  atkPercent: number | null;
  wageRaiseKind?: 'percent' | 'fixed' | null;
  wageRaiseValue?: number;
};

export type WageShift = {
  shiftDate: string;
  hours: number;
  hourType?: string;
  travelKm?: number;
  travelMinutes?: number;
  perDiem?: string; // none | half | full
  projectId?: string;
};

// A shift as stored, before it becomes pay items.
export type StoredWageShift = {
  shiftDate: string;
  durationMs?: number;
  manualDurationMs?: number | null;
  hourType?: string;
  overtimeMs?: number;
  overtimeStatus?: string | null;
  travelKm?: number;
  travelMinutes?: number;
  perDiem?: string;
  projectId?: string;
};

// One shift becomes one or two wage shifts. Approved övertid inside the day
// ("8 h normal + 2 h övertid") is paid as its own overtime part; pending or
// denied övertid stays in the day's own hour type. Travel and per diem stay on
// the first part only, so they are paid once.
export function toWageShifts(shift: StoredWageShift): WageShift[] {
  // Worker-entered hours win over GPS-measured, as in the hours grid.
  const totalMs =
    shift.manualDurationMs != null
      ? Number(shift.manualDurationMs)
      : Number(shift.durationMs) || 0;
  const overtimeMs =
    shift.overtimeStatus === 'approved'
      ? Math.min(Math.max(0, Number(shift.overtimeMs) || 0), totalMs)
      : 0;
  const main: WageShift = {
    shiftDate: shift.shiftDate,
    hours: (totalMs - overtimeMs) / 3_600_000,
    hourType: shift.hourType,
    travelKm: shift.travelKm,
    travelMinutes: shift.travelMinutes,
    perDiem: shift.perDiem,
    projectId: shift.projectId,
  };
  if (!overtimeMs) return [main];
  return [
    main,
    {
      shiftDate: shift.shiftDate,
      hours: overtimeMs / 3_600_000,
      hourType: 'overtime',
      projectId: shift.projectId,
    },
  ];
}

export type WageLeave = {
  type: string; // LeaveType
  startDate: string;
  endDate: string;
  halfDay?: boolean;
};

export type WageRateEntry = { validFrom: string; hourlyRate: number };

export type WageWorker = {
  userId: string;
  name: string;
  // Today's rate; used for any day the history doesn't cover.
  hourlyRate: number | null;
  wageCategory?: string | null;
  // Lönehistorik, any order.
  rates?: WageRateEntry[];
};

// The worker's hourly wage on `date`: the latest history entry from that day
// or earlier, else the current rate.
export function rateOn(worker: WageWorker, date: string): number {
  let best: WageRateEntry | null = null;
  for (const r of worker.rates || []) {
    if (r.validFrom <= date && (!best || r.validFrom > best.validFrom)) best = r;
  }
  return round2(Number(best ? best.hourlyRate : worker.hourlyRate) || 0);
}

// The wage an agreement version's general raise gives a worker: the old wage
// plus the raise, and never below the version's minimum for the category.
export function proposeRaisedRate(
  currentRate: number,
  rules: Pick<WageRuleSet, 'wageRaiseKind' | 'wageRaiseValue' | 'minimumWages'>,
  category?: string | null,
): number {
  const value = Number(rules.wageRaiseValue) || 0;
  let raised = currentRate;
  if (rules.wageRaiseKind === 'fixed') raised = currentRate + value;
  else if (rules.wageRaiseKind === 'percent') raised = currentRate * (1 + value / 100);
  const minimum = rules.minimumWages.find((m) => m.category === category)?.hourly;
  return round2(Math.max(raised, minimum ?? 0));
}

export type WageItemKind = 'salary' | 'absence';

export type WageItem = {
  code: string;
  label: string;
  kind: WageItemKind;
  date: string;
  quantity: number;
  unit: 'h' | 'km' | 'day' | 'sek';
  unitPrice: number;
  amount: number;
  taxFree: boolean;
  projectId?: string;
  ruleSetId?: string;
};

export type WageWarning = { code: string; message: string; date?: string };

export type WorkerWageBasis = {
  userId: string;
  name: string;
  hourlyRate: number;
  wageCategory: string | null;
  items: WageItem[];
  warnings: WageWarning[];
  totals: {
    workedHours: number;
    absenceHours: number;
    taxableAmount: number;
    taxFreeAmount: number;
  };
};

// Wage-basis item codes. These are the keys the company maps to the
// lönearter / frånvarokoder in PayrollSettings.
export const SALARY_ITEM_LABELS: Record<string, string> = {
  hours_normal: 'Timlön',
  hours_overtime: 'Timlön övertid',
  hours_ob: 'Timlön OB',
  supplement_overtime: 'Övertidstillägg',
  supplement_ob: 'OB-tillägg',
  travel_time: 'Restidsersättning',
  mileage_taxfree: 'Bilersättning skattefri',
  mileage_taxable: 'Bilersättning skattepliktig',
  per_diem_full_taxfree: 'Traktamente heldag skattefritt',
  per_diem_half_taxfree: 'Traktamente halvdag skattefritt',
  per_diem_taxable: 'Traktamente skattepliktigt',
  vacation_pay: 'Semesterersättning',
  atk: 'Arbetstidsförkortning (ATK)',
};

export const ABSENCE_ITEM_LABELS: Record<string, string> = {
  absence_sick: 'Sjukfrånvaro',
  absence_vacation: 'Semester',
  absence_vab: 'VAB',
  absence_parental: 'Föräldraledighet',
  absence_leave: 'Tjänstledighet',
  absence_other: 'Övrig frånvaro',
};

// Standard PAXml frånvarokoder; the company can override them in settings.
export const DEFAULT_ABSENCE_CODES: Record<string, string> = {
  absence_sick: 'SJK',
  absence_vacation: 'SEM',
  absence_vab: 'VAB',
  absence_parental: 'FPE',
  absence_leave: 'TJL',
};

// Byggavtalet's ordinary working time is 40 h/week; a full absence day on a
// weekday counts as 8 h.
export const ABSENCE_HOURS_PER_DAY = 8;

// Pay that semesterersättning and ATK are calculated on.
const VACATION_BASIS_CODES = new Set([
  'hours_normal',
  'hours_overtime',
  'hours_ob',
  'supplement_overtime',
  'supplement_ob',
  'travel_time',
]);

export function ruleSetForDate(
  ruleSets: WageRuleSet[],
  date: string,
): WageRuleSet | null {
  // Latest validFrom wins if versions overlap.
  const matching = ruleSets
    .filter((r) => r.validFrom <= date && (!r.validTo || date <= r.validTo))
    .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
  return matching[0] || null;
}

const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const isWeekend = (date: string): boolean => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
};

function hourTypeKey(hourType?: string): string {
  const t = String(hourType || 'normal').toLowerCase();
  return t || 'normal';
}

export function buildWorkerWageBasis(
  worker: WageWorker,
  shifts: WageShift[],
  leaves: WageLeave[],
  ruleSets: WageRuleSet[],
  period: { from: string; to: string },
): WorkerWageBasis {
  const items: WageItem[] = [];
  const warnings: WageWarning[] = [];
  // The rate shown for the period; each day is paid at its own rate (rateOn).
  const rate = rateOn(worker, period.to);
  const category = worker.wageCategory || null;

  if (!rate) {
    warnings.push({
      code: 'missing_rate',
      message: 'Timlön saknas — sätt timlön på den anställde.',
    });
  }
  if (!category) {
    warnings.push({
      code: 'missing_category',
      message:
        'Lönekategori enligt avtalet saknas — minimilönen kan inte kontrolleras.',
    });
  }

  const push = (item: Omit<WageItem, 'label'> & { label?: string }) => {
    if (!item.amount && item.kind === 'salary') return;
    items.push({
      ...item,
      label:
        item.label ||
        SALARY_ITEM_LABELS[item.code] ||
        ABSENCE_ITEM_LABELS[item.code] ||
        item.code,
    });
  };

  const missingRuleDates = new Set<string>();
  const usedRuleSets = new Map<string, WageRuleSet>();

  for (const shift of shifts) {
    const date = shift.shiftDate;
    if (date < period.from || date > period.to) continue;
    const rules = ruleSetForDate(ruleSets, date);
    if (rules) usedRuleSets.set(rules.id, rules);
    else missingRuleDates.add(date);

    const hours = round2(Number(shift.hours) || 0);
    const type = hourTypeKey(shift.hourType);
    const dayRate = rateOn(worker, date);
    const base = {
      kind: 'salary' as const,
      date,
      projectId: shift.projectId,
      ruleSetId: rules?.id,
      taxFree: false,
    };

    if (hours > 0) {
      push({
        ...base,
        code: `hours_${type}`,
        quantity: hours,
        unit: 'h',
        unitPrice: dayRate,
        amount: round2(hours * dayRate),
      });

      if (type !== 'normal') {
        const supplement = rules?.hourTypeSupplements.find(
          (s) => hourTypeKey(s.hourType) === type,
        );
        if (supplement) {
          const perHour =
            supplement.kind === 'fixed'
              ? round2(supplement.value)
              : round2((dayRate * supplement.value) / 100);
          push({
            ...base,
            code: `supplement_${type}`,
            label: supplement.label || undefined,
            quantity: hours,
            unit: 'h',
            unitPrice: perHour,
            amount: round2(hours * perHour),
          });
        } else if (rules) {
          warnings.push({
            code: 'missing_supplement',
            message: `Avtalsversionen "${rules.name}" har inget tillägg för timtyp "${type}".`,
            date,
          });
        }
      }
    }

    if (!rules) continue;

    const travelHours = round2((Number(shift.travelMinutes) || 0) / 60);
    if (travelHours > 0 && rules.travelTimeRatePerHour > 0) {
      push({
        ...base,
        code: 'travel_time',
        quantity: travelHours,
        unit: 'h',
        unitPrice: rules.travelTimeRatePerHour,
        amount: round2(travelHours * rules.travelTimeRatePerHour),
      });
    }

    const km = round2(Number(shift.travelKm) || 0);
    if (km > 0 && rules.mileageRatePerKm > 0) {
      const taxFreePerKm = Math.min(
        rules.mileageTaxFreePerKm,
        rules.mileageRatePerKm,
      );
      push({
        ...base,
        code: 'mileage_taxfree',
        quantity: km,
        unit: 'km',
        unitPrice: taxFreePerKm,
        amount: round2(km * taxFreePerKm),
        taxFree: true,
      });
      const taxablePerKm = round2(rules.mileageRatePerKm - taxFreePerKm);
      push({
        ...base,
        code: 'mileage_taxable',
        quantity: km,
        unit: 'km',
        unitPrice: taxablePerKm,
        amount: round2(km * taxablePerKm),
      });
    }

    const perDiem = String(shift.perDiem || 'none');
    if (perDiem === 'full' || perDiem === 'half') {
      const full = perDiem === 'full';
      const paid = full ? rules.perDiemFull : rules.perDiemHalf;
      const taxFree = Math.min(
        full ? rules.perDiemTaxFreeFull : rules.perDiemTaxFreeHalf,
        paid,
      );
      if (!paid) {
        warnings.push({
          code: 'missing_per_diem',
          message: `Traktamentsbelopp saknas i avtalsversionen "${rules.name}".`,
          date,
        });
      }
      push({
        ...base,
        code: full ? 'per_diem_full_taxfree' : 'per_diem_half_taxfree',
        quantity: 1,
        unit: 'day',
        unitPrice: taxFree,
        amount: round2(taxFree),
        taxFree: true,
      });
      push({
        ...base,
        code: 'per_diem_taxable',
        quantity: 1,
        unit: 'day',
        unitPrice: round2(paid - taxFree),
        amount: round2(paid - taxFree),
      });
    }
  }

  // Absence: one item per weekday inside the period. Sick pay, karens and
  // vacation days are calculated by the payroll system from the frånvarokod, so
  // ByggExp only reports the time.
  for (const leave of leaves) {
    const code = `absence_${leave.type}`;
    const from = leave.startDate > period.from ? leave.startDate : period.from;
    const to = leave.endDate < period.to ? leave.endDate : period.to;
    if (!from || !to || from > to) continue;
    const hoursPerDay = leave.halfDay
      ? ABSENCE_HOURS_PER_DAY / 2
      : ABSENCE_HOURS_PER_DAY;
    for (let date = from; date <= to; date = addDays(date, 1)) {
      if (isWeekend(date)) continue;
      push({
        code: ABSENCE_ITEM_LABELS[code] ? code : 'absence_other',
        kind: 'absence',
        date,
        quantity: hoursPerDay,
        unit: 'h',
        unitPrice: 0,
        amount: 0,
        taxFree: false,
      });
    }
  }

  // Semesterersättning and ATK accrue on the period's pay, per agreement
  // version, dated on the last day that version covers in the period.
  for (const rules of usedRuleSets.values()) {
    const basis = round2(
      items
        .filter((i) => i.ruleSetId === rules.id && VACATION_BASIS_CODES.has(i.code))
        .reduce((s, i) => s + i.amount, 0),
    );
    const date =
      rules.validTo && rules.validTo < period.to ? rules.validTo : period.to;
    const accruals: Array<[string, number | null]> = [
      ['vacation_pay', rules.vacationPayPercent],
      ['atk', rules.atkPercent],
    ];
    for (const [code, percent] of accruals) {
      if (percent == null || !basis) continue;
      push({
        code,
        kind: 'salary',
        date,
        quantity: percent,
        unit: 'sek',
        unitPrice: basis,
        amount: round2((basis * percent) / 100),
        taxFree: false,
        ruleSetId: rules.id,
      });
    }

    const minimum = rules.minimumWages.find((m) => m.category === category);
    if (category && category !== 'other' && !minimum) {
      warnings.push({
        code: 'missing_minimum_wage',
        message: `Avtalsversionen "${rules.name}" saknar minimilön för kategorin "${category}".`,
      });
    }
    // Checked at the last day this version covers in the period.
    const versionRate = rateOn(worker, date);
    if (minimum && versionRate > 0 && versionRate < minimum.hourly) {
      warnings.push({
        code: 'below_minimum_wage',
        message: `Timlönen ${versionRate} kr är lägre än avtalets minimilön ${minimum.hourly} kr (${rules.name}).`,
      });
    }
  }

  if (missingRuleDates.size) {
    const dates = [...missingRuleDates].sort();
    warnings.push({
      code: 'missing_rule_set',
      message: `Ingen publicerad avtalsversion gäller ${dates[0]}${dates.length > 1 ? ` – ${dates[dates.length - 1]}` : ''}. Endast grundlön är beräknad för dessa dagar.`,
    });
  }

  items.sort((a, b) =>
    a.date === b.date ? a.code.localeCompare(b.code) : a.date < b.date ? -1 : 1,
  );

  const sum = (pred: (i: WageItem) => boolean) =>
    round2(items.filter(pred).reduce((s, i) => s + i.amount, 0));
  return {
    userId: worker.userId,
    name: worker.name,
    hourlyRate: rate,
    wageCategory: category,
    items,
    warnings,
    totals: {
      workedHours: round2(
        items
          .filter((i) => i.code.startsWith('hours_'))
          .reduce((s, i) => s + i.quantity, 0),
      ),
      absenceHours: round2(
        items
          .filter((i) => i.kind === 'absence')
          .reduce((s, i) => s + i.quantity, 0),
      ),
      taxableAmount: sum((i) => i.kind === 'salary' && !i.taxFree),
      taxFreeAmount: sum((i) => i.kind === 'salary' && i.taxFree),
    },
  };
}
