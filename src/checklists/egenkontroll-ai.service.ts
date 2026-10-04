import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { readFile } from "fs/promises";
import { join } from "path";
import { PDFDocument } from "pdf-lib";
import {
  callClaude,
  ClaudeBlock,
  claudeEnabled,
  imageBlock,
  imageToJpeg,
  parseJsonObject,
} from "../common/anthropic.client";
import {
  AiPhoto,
  DraftChecklist,
  NewSuggestion,
  normalizeDraft,
  normalizeMatches,
  pickSuggestions,
  SuggestionInput,
} from "./egenkontroll-ai.logic";

// Contracts can be long; the scope of work is near the start and every page is
// billed, so only the first pages are read.
const MAX_DOC_PAGES = 20;
// Photos sent per analysis call (newest first).
export const MAX_PHOTOS_PER_ANALYSIS = 10;

const DRAFT_PROMPT = `Du är kvalitetsansvarig på ett svenskt byggföretag. Bifogat är ett avtal, en arbetsbeskrivning eller en offert för ett arbete.

Skapa en egenkontroll för entreprenören: de kontrollpunkter som visar att arbetet i dokumentet är rätt utfört. Utgå från arbetsmomenten i dokumentet.

Svara ENDAST med ett JSON-objekt (ingen text runt, inga kodblock):
{
  "title": string,      // kort titel, t.ex. "Egenkontroll badrumsrenovering – Storgatan 5"
  "category": string,   // "quality" | "environment" | "work_environment" | "other"
  "items": [
    { "text": string,       // vad som kontrolleras och hur (metod), en kort mening, på svenska
      "reference": string } // krav/underlag, annars ""
  ]
}

Regler:
- 5–25 punkter, i den ordning arbetet utförs.
- Varje punkt ska gå att verifiera på plats, gärna med ett foto.
- Hitta inte på mått, märken eller adresser som inte står i dokumentet.
- reference: skriv bara ett krav du är helt säker på gäller just den punkten — t.ex. "GVK Våtrumsregler", "Säker Vatten", "SS 436 40 00" (endast elinstallation), "BBR 6:5" (fukt/våtrum), "tillverkarens anvisning" eller en handling som nämns i dokumentet. Skriv aldrig ut förkortningar på egen hand. Är du osäker: "".`;

function matchPrompt(items: { text: string; reference: string }[], photos: AiPhoto[]) {
  const list = items
    .map((it, i) => `${i + 1}. ${it.text}${it.reference ? ` (${it.reference})` : ""}`)
    .join("\n");
  const dates = photos.map((p, i) => `Foto ${i + 1}: ${p.date || "okänt datum"}`).join("\n");
  return `Du granskar en egenkontroll på ett svenskt bygge. Bilderna ovan är foton från arbetsplatsen, i ordning Foto 1, Foto 2, …

${dates}

Kontrollpunkter:
${list}

För varje kontrollpunkt som ett foto tydligt visar som utförd: ange matchen. Visar fotot ett fel eller en brist mot punkten, ange result "remark". Gissa inte — matcha bara när fotot faktiskt visar momentet.

Svara ENDAST med JSON:
{ "matches": [ { "item": number, "photo": number, "result": "ok" | "remark", "confidence": number, "reason": string } ] }
- item och photo är numren ovan.
- confidence 0–1.
- reason: en kort mening på svenska om vad fotot visar.
- Tom lista om inget foto passar.`;
}

// AI for egenkontroll: contract → draft control points, site photos → suggested
// results. Gated on ANTHROPIC_API_KEY. Models are env-configurable.
@Injectable()
export class EgenkontrollAiService {
  private readonly logger = new Logger(EgenkontrollAiService.name);
  private readonly docModel =
    process.env.EGENKONTROLL_DOC_MODEL || "claude-sonnet-5-5";
  private readonly photoModel =
    process.env.EGENKONTROLL_PHOTO_MODEL || "claude-sonnet-5-5";

  get enabled(): boolean {
    return claudeEnabled();
  }

  // TEMP debug: last raw photo-matching reply (exposed via analyze?debug=1).
  lastPhotoReply = "";

  async draftFromDocument(
    file: { buffer: Buffer; mimetype: string } | null,
    text: string,
  ): Promise<DraftChecklist> {
    const content: ClaudeBlock[] = [];
    if (file) {
      if (file.mimetype === "application/pdf") {
        const pdf = await this.firstPages(file.buffer);
        content.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: pdf.toString("base64"),
          },
        });
      } else if (/^image\//.test(file.mimetype) || /heic|heif/i.test(file.mimetype)) {
        content.push(imageBlock(await imageToJpeg(file.buffer, file.mimetype)));
      } else {
        // Plain text / unknown: send as text.
        text = `${file.buffer.toString("utf8").slice(0, 60000)}\n${text}`;
      }
    }
    if (text.trim()) {
      content.push({ type: "text", text: `Dokument:\n${text.slice(0, 60000)}` });
    }
    if (!content.length) {
      throw new ServiceUnavailableException("No document to read");
    }
    content.push({ type: "text", text: DRAFT_PROMPT });
    const reply = await callClaude({ model: this.docModel, maxTokens: 4096, content });
    try {
      return normalizeDraft(parseJsonObject(reply));
    } catch (error) {
      this.logger.error("Failed to parse draft", error as Error);
      throw new ServiceUnavailableException(
        "Could not read the document — please add the points manually",
      );
    }
  }

  async suggestFromPhotos(
    items: (SuggestionInput & { text: string; reference: string })[],
    photos: AiPhoto[],
  ): Promise<NewSuggestion[]> {
    if (!items.length || !photos.length) return [];
    const content: ClaudeBlock[] = [];
    const sent: AiPhoto[] = [];
    for (const photo of photos.slice(0, MAX_PHOTOS_PER_ANALYSIS)) {
      try {
        const buf = await readFile(join(process.cwd(), photo.url.replace(/^\//, "")));
        content.push(imageBlock(await imageToJpeg(buf, "")));
        sent.push(photo);
      } catch (error) {
        this.logger.warn(`Skipping unreadable photo ${photo.url}`);
      }
    }
    if (!sent.length) return [];
    content.push({ type: "text", text: matchPrompt(items, sent) });
    const reply = await callClaude({ model: this.photoModel, maxTokens: 2048, content });
    this.lastPhotoReply = reply;
    this.logger.log(`Photo match reply: ${reply.slice(0, 1500)}`);
    try {
      return pickSuggestions(items, sent, normalizeMatches(parseJsonObject(reply)));
    } catch (error) {
      this.logger.error("Failed to parse photo matches", error as Error);
      return [];
    }
  }

  private async firstPages(buffer: Buffer): Promise<Buffer> {
    try {
      const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
      if (src.getPageCount() <= MAX_DOC_PAGES) return buffer;
      const out = await PDFDocument.create();
      const pages = await out.copyPages(
        src,
        Array.from({ length: MAX_DOC_PAGES }, (_, i) => i),
      );
      pages.forEach((p) => out.addPage(p));
      return Buffer.from(await out.save());
    } catch {
      return buffer;
    }
  }
}
