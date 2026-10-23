import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ClaudeBlock,
  callClaude,
  claudeEnabled,
  parseJsonObject,
} from '../common/anthropic.client';
import {
  AgreementRuleSet,
  AgreementRuleSetDocument,
  AgreementRuleSetStatus,
  WageCategory,
} from './schemas/agreement-rule-set.schema';

// Reads an agreement text or circular (Byggnads / Byggföretagen PDF, or pasted
// text) and turns the figures it states into a DRAFT agreement version. The
// draft starts from the latest published version, overrides only what the
// document states, and lists where each figure was found. A superadmin checks
// every number against the document before publishing — nothing here is ever
// published automatically.

const MODEL = process.env.PAYROLL_RULES_MODEL || 'claude-opus-5-5';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Extracted = {
  name?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  wageRaise?: { kind?: string | null; value?: number | null; quote?: string } | null;
  minimumWages?: Array<{
    category?: string;
    label?: string;
    hourly?: number;
    quote?: string;
  }>;
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

const PROMPT = `You read a Swedish construction collective agreement document (Byggavtalet, a Byggnads or Byggföretagen circular, or a wage table) and extract ONLY figures that the document states explicitly. Never estimate, never carry over numbers you remember from other years. When a figure is not stated, use null or leave it out.

Return one JSON object, no prose:
{
  "name": "short name, e.g. \\"Byggavtalet 2026-05-01\\"" or null,
  "validFrom": "YYYY-MM-DD" (the date the wages/rules in the document start applying) or null,
  "validTo": "YYYY-MM-DD" or null,
  "wageRaise": { "kind": "fixed" (kr per hour) | "percent", "value": number, "quote": "exact sentence from the document" } or null,
  "minimumWages": [ { "category": "yrkesarbetare" | "ny_i_branschen" | "larling", "label": "the document's own wording", "hourly": number (kr per hour), "quote": "exact text" } ],
  "hourTypeSupplements": [ { "hourType": "overtime" | "ob", "label": "e.g. Övertid kvalificerad / OB 1", "kind": "percent" (of hourly wage) | "fixed" (kr per hour), "value": number, "quote": "exact text" } ],
  "vacationPayPercent": { "value": number, "quote": "exact text" } or null,
  "travelTimeRatePerHour": { "value": number, "quote": "exact text" } or null,
  "notes": ["anything a payroll admin must know that does not fit above, e.g. several minimum-wage steps for new workers, or monthly-paid amounts"]
}

Rules:
- Amounts in Swedish format ("7,54 kronor") become numbers (7.54).
- If the document gives a raise both per hour and per month, use the per-hour figure.
- If there are several steps for new workers or apprentices, put the lowest relevant step in minimumWages and describe all steps in notes.
- Every figure must have a quote copied from the document.`;

@Injectable()
export class AgreementDraftService {
  private readonly logger = new Logger(AgreementDraftService.name);

  constructor(
    @InjectModel(AgreementRuleSet.name)
    private ruleSetModel: Model<AgreementRuleSetDocument>,
  ) {}

  async draftFromDocument(input: {
    file?: { buffer: Buffer; mimetype: string; originalname: string };
    text?: string;
    sourceLabel?: string;
  }): Promise<AgreementRuleSetDocument> {
    if (!claudeEnabled()) {
      throw new BadRequestException('AI is not configured on this server');
    }
    const content: ClaudeBlock[] = [];
    if (input.file) {
      if (input.file.mimetype !== 'application/pdf') {
        throw new BadRequestException('Upload a PDF, or paste the text instead');
      }
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: input.file.buffer.toString('base64'),
        },
      });
    } else if (input.text?.trim()) {
      content.push({ type: 'text', text: `DOCUMENT:\n${input.text.trim()}` });
    } else {
      throw new BadRequestException('Provide a PDF file or the document text');
    }
    content.push({ type: 'text', text: PROMPT });

    const reply = await callClaude({ model: MODEL, maxTokens: 8000, content });
    let data: Extracted;
    try {
      data = parseJsonObject<Extracted>(reply);
    } catch {
      this.logger.warn(`Unparseable extraction reply: ${reply.slice(0, 300)}`);
      throw new BadRequestException('Could not read figures from the document');
    }

    // Start from the latest published version so unstated rules carry over.
    const base = await this.ruleSetModel
      .findOne({ status: AgreementRuleSetStatus.Published })
      .sort({ validFrom: -1 })
      .lean()
      .exec();
    const baseCopy: Record<string, unknown> = base ? { ...base } : {};
    for (const key of ['_id', 'createdAt', 'updatedAt', '__v', 'publishedAt', 'publishedByUserId']) {
      delete baseCopy[key];
    }

    const num = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
    const quotes: string[] = [];
    const draft: Record<string, unknown> = {
      ...baseCopy,
      agreement: 'byggavtalet',
      status: AgreementRuleSetStatus.Draft,
      aiDraft: true,
    };

    const validFrom =
      data.validFrom && DATE.test(data.validFrom) ? data.validFrom : null;
    draft.validFrom = validFrom || (base?.validFrom ?? new Date().toISOString().slice(0, 10));
    draft.validTo = data.validTo && DATE.test(data.validTo) ? data.validTo : '';
    draft.name =
      (data.name || '').trim() ||
      `Byggavtalet från ${draft.validFrom as string}`;

    const raiseValue = num(data.wageRaise?.value);
    if (data.wageRaise && raiseValue && ['fixed', 'percent'].includes(String(data.wageRaise.kind))) {
      draft.wageRaiseKind = data.wageRaise.kind;
      draft.wageRaiseValue = raiseValue;
      quotes.push(`Lönehöjning: "${data.wageRaise.quote || ''}"`);
    } else {
      draft.wageRaiseKind = null;
      draft.wageRaiseValue = 0;
    }

    const categories = Object.values(WageCategory) as string[];
    const minimums = (data.minimumWages || []).filter(
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

    const supplements = (data.hourTypeSupplements || []).filter(
      (s) =>
        ['overtime', 'ob'].includes(String(s.hourType)) &&
        ['percent', 'fixed'].includes(String(s.kind)) &&
        num(s.value),
    );
    if (supplements.length) {
      draft.hourTypeSupplements = supplements.map((s) => ({
        hourType: s.hourType,
        label: s.label || '',
        kind: s.kind,
        value: s.value,
      }));
      supplements.forEach((s) => quotes.push(`${s.label || s.hourType}: "${s.quote || ''}"`));
    }

    const vacation = num(data.vacationPayPercent?.value);
    if (vacation != null) {
      draft.vacationPayPercent = vacation;
      quotes.push(`Semester: "${data.vacationPayPercent?.quote || ''}"`);
    }
    const travel = num(data.travelTimeRatePerHour?.value);
    if (travel != null) {
      draft.travelTimeRatePerHour = travel;
      quotes.push(`Restid: "${data.travelTimeRatePerHour?.quote || ''}"`);
    }

    const source = input.sourceLabel || input.file?.originalname || 'inklistrad text';
    draft.sourceNote = [
      `UTKAST skapat med AI från ${source} — kontrollera varje belopp mot dokumentet innan publicering.`,
      base ? `Övriga regler kopierade från "${base.name}".` : '',
      ...quotes,
      ...(data.notes || []).map((n) => `Obs: ${n}`),
    ]
      .filter(Boolean)
      .join('\n');

    return new this.ruleSetModel(draft).save();
  }
}
