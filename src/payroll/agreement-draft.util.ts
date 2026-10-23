import { WageCategory } from './schemas/agreement-rule-set.schema';

// Pure parts of the agreement draft flow: which public PDFs count as
// Byggavtalet documents, and how an AI extraction becomes draft versions.

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Byggnads' agreement page lists every agreement it signs; only Byggavtalet
// documents (the agreement itself and its hängavtal circular) feed the rules.
// The English edition repeats the Swedish one.
const AGREEMENT_PDF = /byggavtal/i;

export function agreementPdfLinks(html: string, pageUrl: string): string[] {
  const links = new Set<string>();
  for (const match of html.matchAll(/href\s*=\s*"([^"]+\.pdf)(?:[?#][^"]*)?"/gi)) {
    let url: string;
    try {
      url = new URL(match[1].replace(/&amp;/g, '&'), pageUrl).href;
    } catch {
      continue;
    }
    const file = decodeURIComponent(url.split('/').pop() || '');
    if (AGREEMENT_PDF.test(file) && /^https:/i.test(url)) links.add(url);
  }
  return [...links];
}

export type ExtractedPeriod = {
  validFrom?: string | null;
  validTo?: string | null;
  wageRaise?: { kind?: string | null; value?: number | null; quote?: string } | null;
  minimumWages?: Array<{
    category?: string;
    label?: string;
    hourly?: number;
    quote?: string;
  }>;
};

export type Extracted = {
  name?: string | null;
  periods?: ExtractedPeriod[];
  hourTypeSupplements?: Array<{
    hourType?: string;
    label?: string;
    kind?: string;
    value?: number;
    quote?: string;
  }>;
  vacationPayPercent?: { value?: number | null; quote?: string } | null;
  travelTimeRatePerHour?: { value?: number | null; quote?: string } | null;
  notes?: string[];
};

const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

// One draft per wage period the documents state (Byggavtalet raises wages
// every May, so a two-year agreement gives two versions). Rules the documents
// do not mention are copied from `base`, the latest published version.
export function draftsFromExtraction(
  data: Extracted,
  base: Record<string, unknown> | null,
  source: string,
  today: string,
): Record<string, unknown>[] {
  const baseCopy: Record<string, unknown> = base ? { ...base } : {};
  for (const key of ['_id', 'createdAt', 'updatedAt', '__v', 'publishedAt', 'publishedByUserId']) {
    delete baseCopy[key];
  }

  const shared: Record<string, unknown> = {};
  const sharedQuotes: string[] = [];
  const supplements = (data.hourTypeSupplements || []).filter(
    (s) =>
      ['overtime', 'ob'].includes(String(s.hourType)) &&
      ['percent', 'fixed'].includes(String(s.kind)) &&
      num(s.value),
  );
  if (supplements.length) {
    shared.hourTypeSupplements = supplements.map((s) => ({
      hourType: s.hourType,
      label: s.label || '',
      kind: s.kind,
      value: s.value,
    }));
    supplements.forEach((s) => sharedQuotes.push(`${s.label || s.hourType}: "${s.quote || ''}"`));
  }
  const vacation = num(data.vacationPayPercent?.value);
  if (vacation != null) {
    shared.vacationPayPercent = vacation;
    sharedQuotes.push(`Semester: "${data.vacationPayPercent?.quote || ''}"`);
  }
  const travel = num(data.travelTimeRatePerHour?.value);
  if (travel != null) {
    shared.travelTimeRatePerHour = travel;
    sharedQuotes.push(`Restid: "${data.travelTimeRatePerHour?.quote || ''}"`);
  }

  const periods = (data.periods || [])
    .filter((p) => p.validFrom && DATE.test(p.validFrom))
    .sort((a, b) => String(a.validFrom).localeCompare(String(b.validFrom)));
  if (!periods.length) periods.push({});

  const categories = Object.values(WageCategory) as string[];
  const baseName = (data.name || '').trim();
  return periods.map((period, index) => {
    const quotes: string[] = [];
    const draft: Record<string, unknown> = {
      ...baseCopy,
      ...shared,
      agreement: 'byggavtalet',
      status: 'draft',
      aiDraft: true,
    };
    draft.validFrom = period.validFrom || (base?.validFrom as string) || today;
    draft.validTo =
      period.validTo && DATE.test(period.validTo) ? period.validTo : '';
    const label = periods.length > 1 ? `, år ${index + 1}` : '';
    draft.name = baseName
      ? `${baseName}${label}`
      : `Byggavtalet från ${draft.validFrom as string}`;

    const raiseValue = num(period.wageRaise?.value);
    if (period.wageRaise && raiseValue && ['fixed', 'percent'].includes(String(period.wageRaise.kind))) {
      draft.wageRaiseKind = period.wageRaise.kind;
      draft.wageRaiseValue = raiseValue;
      quotes.push(`Lönehöjning: "${period.wageRaise.quote || ''}"`);
    } else {
      draft.wageRaiseKind = null;
      draft.wageRaiseValue = 0;
    }

    const minimums = (period.minimumWages || []).filter(
      (m) => categories.includes(String(m.category)) && num(m.hourly),
    );
    if (minimums.length) {
      draft.minimumWages = minimums.map((m) => ({
        category: m.category,
        label: m.label || '',
        hourly: m.hourly,
      }));
      minimums.forEach((m) => quotes.push(`Minimilön ${m.category}: "${m.quote || ''}"`));
    }

    draft.sourceNote = [
      `UTKAST skapat med AI från ${source} — kontrollera varje belopp mot dokumentet innan publicering.`,
      base ? `Övriga regler kopierade från "${String(base.name)}".` : '',
      ...quotes,
      ...sharedQuotes,
      ...(data.notes || []).map((n) => `Obs: ${n}`),
    ]
      .filter(Boolean)
      .join('\n');
    return draft;
  });
}
