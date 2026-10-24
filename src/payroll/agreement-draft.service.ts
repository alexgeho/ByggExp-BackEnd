import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ClaudeBlock,
  callClaude,
  claudeEnabled,
  parseJsonObject,
} from '../common/anthropic.client';
import { cronsDisabled } from '../common/cron.util';
import {
  AgreementRuleSet,
  AgreementRuleSetDocument,
  AgreementRuleSetStatus,
} from './schemas/agreement-rule-set.schema';
import { RuleSource, RuleSourceDocument } from './schemas/rule-source.schema';
import { RuleWatchService } from './rule-watch.service';
import { textHash } from './rule-watch.util';
import {
  Extracted,
  agreementPdfLinks,
  draftsFromExtraction,
} from './agreement-draft.util';
import { swedishToday } from './wage-history';

// Reads agreement documents (Byggavtalet, a Byggnads / Byggföretagen circular,
// or pasted text) and turns the figures they state into DRAFT agreement
// versions, one per wage period. The documents are either uploaded by a
// superadmin or found on the watched Byggnads pages. A draft starts from the
// latest published version, overrides only what the documents state, and
// lists where each figure was found. A superadmin checks every number before
// publishing — nothing here is ever published automatically.

const MODEL = process.env.PAYROLL_RULES_MODEL || 'claude-opus-5-5';
const MAX_PDF_BYTES = 25 * 1024 * 1024;

type PdfInput = { buffer: Buffer; name: string };

const PROMPT = `You read Swedish construction collective agreement documents (Byggavtalet, a Byggnads or Byggföretagen circular such as "hängavtalsinformation", or a wage table) and extract ONLY figures that the documents state explicitly. Never estimate, never carry over numbers you remember from other years. When a figure is not stated, use null or leave it out. When several documents are given, combine them: e.g. the agreement gives minimum wages and the circular gives the yearly raises.

Return one JSON object, no prose:
{
  "name": "short name of the agreement period, e.g. \\"Byggavtalet 2025–2027\\"" or null,
  "periods": [
    {
      "validFrom": "YYYY-MM-DD" (the date these wages start applying),
      "validTo": "YYYY-MM-DD" or null,
      "wageRaise": { "kind": "fixed" (kr per hour) | "percent", "value": number, "quote": "exact sentence" } or null,
      "minimumWages": [ { "category": "yrkesarbetare" | "ny_i_branschen" | "larling" | "ovriga_1" (Övriga arbetstagare 1, fördelningstal 0,88), "label": "the document's own wording", "hourly": number (kr per hour), "quote": "exact text" } ]
    }
  ],
  "hourTypeSupplements": [ { "hourType": "overtime" | "ob", "label": "e.g. Övertid A / OB 1", "kind": "percent" (of hourly wage) | "fixed" (kr per hour), "value": number, "quote": "exact text" } ],
  "vacationPayPercent": { "value": number, "quote": "exact text" } or null,
  "travelTimeRatePerHour": { "value": number, "quote": "exact text" } or null,
  "notes": ["anything a payroll admin must know that does not fit above"]
}

Rules:
- One period per date the wages change (Byggavtalet usually raises wages every 1 May), in date order. A period ends the day before the next one starts.
- Amounts in Swedish format ("7,54 kronor") become numbers (7.54).
- If a raise is given both per hour and per month, use the per-hour figure.
- "yrkesarbetare" is the minimum wage for a skilled worker (yrkesarbetare / grundlön).
- "ny_i_branschen" is the step for adult workers (19 years or older) new to the trade ("Övriga arbetstagare"), not the steps for workers under 19. "larling" is the first apprentice step (företagslärling steg 1). Describe all other steps in notes.
- List supplements from the lowest level up (OB 1 before OB 2, Övertid A before B).
- Every figure must have a quote copied from the documents.`;

@Injectable()
export class AgreementDraftService {
  private readonly logger = new Logger(AgreementDraftService.name);
  private discovering = false;

  constructor(
    @InjectModel(AgreementRuleSet.name)
    private ruleSetModel: Model<AgreementRuleSetDocument>,
    @InjectModel(RuleSource.name)
    private sourceModel: Model<RuleSourceDocument>,
    private readonly ruleWatch: RuleWatchService,
  ) {}

  // Reading a full agreement takes longer than the proxy in front of the API
  // waits for a response, so the work runs in the background: the request is
  // checked and accepted at once, the drafts appear in the list when done,
  // and a failure is e-mailed to superadmins.
  startDraftFromDocument(input: {
    file?: { buffer: Buffer; mimetype: string; originalname: string };
    text?: string;
    sourceLabel?: string;
  }): { accepted: true; startedAt: string } {
    this.assertEnabled();
    if (input.file && input.file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Upload a PDF, or paste the text instead');
    }
    if (!input.file && !input.text?.trim()) {
      throw new BadRequestException('Provide a PDF file or the document text');
    }
    const pdfs = input.file
      ? [{ buffer: input.file.buffer, name: input.file.originalname }]
      : [];
    const source = input.sourceLabel || input.file?.originalname || 'inklistrad text';
    return this.runInBackground(source, () =>
      this.draftFromDocuments({ pdfs, text: input.text, source }),
    );
  }

  // Looks for Byggavtalet PDFs on the watched Byggnads pages. Documents not
  // seen before are read into drafts; with `all`, every document currently
  // published is read again (the "fetch the agreement now" button). The first
  // look at a page only records what is there, so documents that were already
  // published when watching started do not produce drafts on their own.
  async discoverDocuments(all: boolean): Promise<{
    accepted: boolean;
    startedAt: string;
    documents: string[];
    errors: string[];
  }> {
    if (all) this.assertEnabled();
    const startedAt = new Date().toISOString();
    const sources = await this.sourceModel
      .find({ enabled: true, area: 'agreement' })
      .exec();
    const errors: string[] = [];
    const found = new Map<string, RuleSourceDocument>();
    for (const source of sources) {
      try {
        const res = await fetch(source.url, {
          headers: { 'User-Agent': 'ByggExp regelbevakning' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        for (const url of agreementPdfLinks(await res.text(), source.url)) {
          if (!found.has(url)) found.set(url, source);
        }
      } catch (error) {
        errors.push(`${source.name}: ${String((error as Error)?.message || error)}`);
      }
    }

    const pdfs: PdfInput[] = [];
    for (const [url, source] of found) {
      const known = (source.documents || []).find((d) => d.url === url);
      const firstLook = !source.documentsBaselinedAt;
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'ByggExp regelbevakning' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length > MAX_PDF_BYTES) throw new Error('file is larger than 25 MB');
        const hash = textHash(buffer.toString('base64'));
        const isNew = !known || known.hash !== hash;
        if (all || (isNew && !firstLook)) {
          pdfs.push({ buffer, name: url });
        }
        if (isNew) {
          source.documents = [
            ...(source.documents || []).filter((d) => d.url !== url),
            { url, hash, seenAt: new Date() },
          ];
        }
      } catch (error) {
        errors.push(`${url}: ${String((error as Error)?.message || error)}`);
      }
    }
    for (const source of sources) {
      if (!source.documentsBaselinedAt) source.documentsBaselinedAt = new Date();
      await source.save();
    }

    if (!pdfs.length) {
      return { accepted: false, startedAt, documents: [], errors };
    }
    this.assertEnabled();
    const label = pdfs.map((p) => p.name).join(', ');
    this.runInBackground(label, async () => {
      const drafts = await this.draftFromDocuments({ pdfs, source: label });
      if (!all) {
        await this.ruleWatch.alertSuperadmins(
          'Nytt avtalsutkast från Byggnads',
          [
            'Byggnads har publicerat nya avtalsdokument. ByggExp har läst dem och skapat utkast:',
            ...drafts.map((d) => `• ${d.name} (från ${d.validFrom})`),
            '',
            'Kontrollera varje belopp mot dokumenten och publicera i Avtalsregler:',
            ...pdfs.map((p) => p.name),
          ].join('\n'),
        );
      }
    });
    return { accepted: true, startedAt, documents: pdfs.map((p) => p.name), errors };
  }

  // Weekly, Monday 05:45 (after the page check at 05:15).
  @Cron('45 5 * * 1')
  async discoverScheduled(): Promise<void> {
    if (cronsDisabled() || this.discovering || !claudeEnabled()) return;
    this.discovering = true;
    try {
      const result = await this.discoverDocuments(false);
      if (result.errors.length) {
        this.logger.warn(`Agreement discovery: ${result.errors.join('; ')}`);
      }
    } catch (error) {
      this.logger.error('Agreement discovery failed', error);
    } finally {
      this.discovering = false;
    }
  }

  async draftFromDocuments(input: {
    pdfs: PdfInput[];
    text?: string;
    source: string;
  }): Promise<AgreementRuleSetDocument[]> {
    this.assertEnabled();
    const content: ClaudeBlock[] = input.pdfs.map((pdf) => ({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: pdf.buffer.toString('base64'),
      },
    }));
    if (input.text?.trim()) {
      content.push({ type: 'text', text: `DOCUMENT:\n${input.text.trim()}` });
    }
    if (!content.length) {
      throw new BadRequestException('Provide a PDF file or the document text');
    }
    content.push({ type: 'text', text: PROMPT });

    const reply = await callClaude({ model: MODEL, maxTokens: 12000, content });
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
    const drafts = draftsFromExtraction(
      data,
      base as Record<string, unknown> | null,
      input.source,
      swedishToday(),
    );
    const saved: AgreementRuleSetDocument[] = [];
    for (const draft of drafts) {
      saved.push(await new this.ruleSetModel(draft).save());
    }
    return saved;
  }

  private assertEnabled() {
    if (!claudeEnabled()) {
      throw new BadRequestException('AI is not configured on this server');
    }
  }

  private runInBackground(
    source: string,
    work: () => Promise<unknown>,
  ): { accepted: true; startedAt: string } {
    const startedAt = new Date().toISOString();
    void work().catch(async (error) => {
      this.logger.error(`Draft from ${source} failed`, error);
      await this.ruleWatch
        .alertSuperadmins(
          'Utkast från dokument misslyckades',
          `ByggExp kunde inte skapa ett avtalsutkast från ${source}: ${String((error as Error)?.message || error)}`,
        )
        .catch(() => undefined);
    });
    return { accepted: true, startedAt };
  }
}
