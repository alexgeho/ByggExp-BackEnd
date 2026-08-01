import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";

export type DraftOfferItem = {
  description: string;
  quantity: number;
  unit: string;
  price: number; // à-price EXCLUDING VAT
  vatRate: number;
  discount: number;
};

export type DraftArticle = {
  name: string;
  unit?: string;
  price?: number;
  vatRate?: number;
};

// Turns a free-typed job description into offer line items, priced against the
// company's own article list, using Claude. Gated on ANTHROPIC_API_KEY — when
// unset the feature reports itself disabled and the UI hides the button.
@Injectable()
export class OfferDraftService {
  private readonly logger = new Logger(OfferDraftService.name);
  private readonly apiKey = process.env.ANTHROPIC_API_KEY || "";
  private readonly model =
    process.env.OFFER_DRAFT_MODEL || "claude-haiku-4-5-20251001";
  private readonly apiUrl = "https://api.anthropic.com/v1/messages";

  get enabled(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(
    description: string,
    articles: DraftArticle[],
  ): Promise<DraftOfferItem[]> {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        "AI offer drafting is not configured (missing ANTHROPIC_API_KEY)",
      );
    }

    const priceList =
      (articles || [])
        .slice(0, 200)
        .map(
          (a) =>
            `- ${a.name} | ${a.unit || "st"} | ${Number(a.price) || 0} kr exkl moms | moms ${Number(a.vatRate ?? 25)}%`,
        )
        .join("\n") || "(inga artiklar registrerade)";

    const prompt = `You are a senior estimator (kalkylator) at a Swedish construction company. Draft an offer (offert) as line items from the job description below.

COMPANY PRICE LIST (articles the firm already uses — prefer these, and keep their unit and price):
${priceList}

JOB DESCRIPTION:
${description}

Return ONLY a JSON array (no prose, no code fences). Each element must be exactly:
{ "description": string, "quantity": number, "unit": string, "price": number, "vatRate": number, "discount": number }

Rules:
- Write every description in Swedish.
- "price" is à-pris EXCLUDING VAT (exkl. moms), a plain number with a dot decimal separator, no currency symbol.
- Prefer matching rows from the price list above (reuse their unit and price). For work not on the list, estimate a realistic Swedish market à-pris.
- vatRate is normally 25 (use 12 or 6 only when clearly applicable). "discount" is a percent, 0 unless the description implies one.
- Break the job into sensible trade steps (rivning, material, arbete, VVS, el, målning, städning, etc.). Between 3 and 15 rows.
- Never return an empty array; if details are missing, make reasonable assumptions.`;

    const res = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Anthropic responded ${res.status}: ${body}`);
      throw new ServiceUnavailableException("AI offer drafting failed");
    }

    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("");

    return this.parseArray(text)
      .map((it) => {
        const vat = this.num(it.vatRate);
        return {
          description: this.str(it.description),
          quantity: this.num(it.quantity) || 1,
          unit: this.str(it.unit) || "st",
          price: this.num(it.price),
          vatRate: [6, 12, 25].includes(vat) ? vat : 25,
          discount: this.num(it.discount),
        };
      })
      .filter((it) => it.description);
  }

  private parseArray(text: string): Array<Record<string, unknown>> {
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start === -1 || end === -1) {
      throw new ServiceUnavailableException(
        "Could not read the AI draft — please add the rows manually",
      );
    }
    try {
      const arr = JSON.parse(cleaned.slice(start, end + 1));
      return Array.isArray(arr) ? arr : [];
    } catch {
      throw new ServiceUnavailableException(
        "Could not read the AI draft — please add the rows manually",
      );
    }
  }

  private num(v: unknown): number {
    const n =
      typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  private str(v: unknown): string {
    return v == null ? "" : String(v).trim();
  }
}
