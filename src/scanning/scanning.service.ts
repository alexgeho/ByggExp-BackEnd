import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import convert from "heic-convert";

export type ScannedDocument = {
  supplierName: string;
  supplierOrgNumber: string;
  invoiceNumber: string;
  date: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  amountExclVat: number;
  vat: number;
  total: number;
  currency: string;
  category: string;
  suggestedKind: "expense" | "supplier_invoice";
  raw?: string;
};

export type ScannedCertificate = {
  name: string;
  number: string;
  issuer: string;
  issuedAt: string; // YYYY-MM-DD
  expiresAt: string; // YYYY-MM-DD
};

// Extracts structured fields from a photographed/scanned receipt or supplier
// invoice using Claude vision. Gated on ANTHROPIC_API_KEY — when unset the
// feature simply reports itself disabled and the UI hides the scan button.
@Injectable()
export class ScanningService {
  private readonly logger = new Logger(ScanningService.name);
  private readonly apiKey = process.env.ANTHROPIC_API_KEY || "";
  private readonly model =
    process.env.SCAN_MODEL || "claude-haiku-4-5-20251001";
  private readonly apiUrl = "https://api.anthropic.com/v1/messages";

  get enabled(): boolean {
    return Boolean(this.apiKey);
  }

  private readonly prompt = `You are a bookkeeping assistant for a Swedish construction company. The attached file is a receipt (kvitto) or a supplier invoice (leverantörsfaktura), often in Swedish.

Extract the fields and return ONLY a JSON object (no prose, no code fences) with exactly these keys:
{
  "supplierName": string,            // the seller/vendor company name
  "supplierOrgNumber": string,       // Swedish org.nr like "556000-0000" if present, else ""
  "invoiceNumber": string,           // invoice/receipt number if present, else ""
  "date": string,                    // purchase/invoice date as YYYY-MM-DD, else ""
  "dueDate": string,                 // due date (förfallodatum) as YYYY-MM-DD, else ""
  "amountExclVat": number,           // net amount excluding VAT (exkl. moms)
  "vat": number,                     // VAT amount (moms)
  "total": number,                   // grand total incl. VAT (att betala)
  "currency": string,                // e.g. "SEK"
  "category": string,                // short expense category in Swedish, e.g. "Material", "Drivmedel", "Verktyg", "Underentreprenör"
  "suggestedKind": string            // "supplier_invoice" if it is a formal invoice with an invoice number/due date, otherwise "expense"
}

Rules:
- Amounts are plain numbers with a dot decimal separator, no currency symbol or spaces (e.g. 1234.50).
- If VAT is shown as 25% and only the total is given, compute: vat = total - total/1.25, amountExclVat = total - vat.
- If a value is missing, use "" for strings and 0 for numbers.
- Never invent an org number or invoice number.`;

  private buildSourceBlock(buffer: Buffer, mimetype: string) {
    const data = buffer.toString("base64");
    if (mimetype === "application/pdf") {
      return {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data },
      };
    }
    const media_type = [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
    ].includes(mimetype)
      ? mimetype
      : "image/jpeg";
    return { type: "image", source: { type: "base64", media_type, data } };
  }

  private parseJson(text: string): Partial<ScannedDocument> {
    const cleaned = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error("No JSON object in model response");
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }

  private num(v: unknown): number {
    const n =
      typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }
  private str(v: unknown): string {
    return v == null ? "" : String(v).trim();
  }

  // iPhone photos arrive as HEIC, which the vision API can't read — transcode
  // to JPEG first. Detected by mime type or the ISO-BMFF "ftyp" brand.
  private hasHeicSignature(buffer: Buffer): boolean {
    if (buffer.length < 12) return false;
    if (buffer.toString("ascii", 4, 8) !== "ftyp") return false;
    const brand = buffer.toString("ascii", 8, 12).toLowerCase();
    return (
      brand.startsWith("hei") ||
      brand.startsWith("mif") ||
      brand.startsWith("msf") ||
      brand === "hevc"
    );
  }

  private async normalizeHeic(
    buffer: Buffer,
    mimetype: string,
  ): Promise<{ buffer: Buffer; mimetype: string }> {
    const isHeic =
      /heic|heif/i.test(mimetype || "") || this.hasHeicSignature(buffer);
    if (!isHeic) return { buffer, mimetype };
    try {
      const out = await convert({ buffer, format: "JPEG", quality: 0.9 });
      return { buffer: Buffer.from(out), mimetype: "image/jpeg" };
    } catch (error) {
      this.logger.warn("HEIC conversion failed; sending original");
      return { buffer, mimetype };
    }
  }

  async extract(buffer: Buffer, mimetype: string): Promise<ScannedDocument> {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        "Document scanning is not configured (missing ANTHROPIC_API_KEY)",
      );
    }

    ({ buffer, mimetype } = await this.normalizeHeic(buffer, mimetype));

    const res = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              this.buildSourceBlock(buffer, mimetype),
              { type: "text", text: this.prompt },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Anthropic responded ${res.status}: ${body}`);
      throw new ServiceUnavailableException("Scanning service failed");
    }

    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("");

    let parsed: Partial<ScannedDocument>;
    try {
      parsed = this.parseJson(text);
    } catch (error) {
      this.logger.error("Failed to parse model output", error as Error);
      throw new ServiceUnavailableException(
        "Could not read the document — please enter the details manually",
      );
    }

    const total = this.num(parsed.total);
    let vat = this.num(parsed.vat);
    let amountExclVat = this.num(parsed.amountExclVat);
    // Backfill missing pieces from a 25% assumption when only the total is read.
    if (total && !amountExclVat && !vat) {
      vat = Math.round((total - total / 1.25) * 100) / 100;
      amountExclVat = Math.round((total - vat) * 100) / 100;
    }

    const kind =
      parsed.suggestedKind === "supplier_invoice"
        ? "supplier_invoice"
        : "expense";

    return {
      supplierName: this.str(parsed.supplierName),
      supplierOrgNumber: this.str(parsed.supplierOrgNumber),
      invoiceNumber: this.str(parsed.invoiceNumber),
      date: this.str(parsed.date),
      dueDate: this.str(parsed.dueDate),
      amountExclVat,
      vat,
      total,
      currency: this.str(parsed.currency) || "SEK",
      category: this.str(parsed.category),
      suggestedKind: kind,
    };
  }

  private readonly certificatePrompt = `You are an assistant for a Swedish construction company. The attached file is a photo or scan of an employee certificate / licence (certifikat / behörighet) — e.g. "Heta arbeten", "ID06", "Säkra lyft", "Ställningsbyggnad" — usually in Swedish.

Extract the fields and return ONLY a JSON object (no prose, no code fences) with exactly these keys:
{
  "name": string,       // the certificate/licence name, e.g. "Heta arbeten"
  "number": string,     // certificate/licence number if present, else ""
  "issuer": string,     // issuing body/organisation if present, else ""
  "issuedAt": string,   // issue date as YYYY-MM-DD, else ""
  "expiresAt": string   // expiry / valid-until date (giltig t.o.m.) as YYYY-MM-DD, else ""
}

Rules:
- Dates must be YYYY-MM-DD. If only a validity period is shown, use its end date for expiresAt.
- If a value is missing or unreadable, use "".
- Never invent a number or a date.`;

  // Extracts certificate fields from a photographed certificate/licence, reusing
  // the same Claude-vision pipeline as receipts. Gated on ANTHROPIC_API_KEY.
  async extractCertificate(
    buffer: Buffer,
    mimetype: string,
  ): Promise<ScannedCertificate> {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        "Document scanning is not configured (missing ANTHROPIC_API_KEY)",
      );
    }

    ({ buffer, mimetype } = await this.normalizeHeic(buffer, mimetype));

    const res = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              this.buildSourceBlock(buffer, mimetype),
              { type: "text", text: this.certificatePrompt },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Anthropic responded ${res.status}: ${body}`);
      throw new ServiceUnavailableException("Scanning service failed");
    }

    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("");

    let parsed: Partial<ScannedCertificate>;
    try {
      parsed = this.parseJson(text) as unknown as Partial<ScannedCertificate>;
    } catch (error) {
      this.logger.error(
        "Failed to parse certificate model output",
        error as Error,
      );
      throw new ServiceUnavailableException(
        "Could not read the certificate — please enter the details manually",
      );
    }

    return {
      name: this.str(parsed.name),
      number: this.str(parsed.number),
      issuer: this.str(parsed.issuer),
      issuedAt: this.str(parsed.issuedAt),
      expiresAt: this.str(parsed.expiresAt),
    };
  }
}
