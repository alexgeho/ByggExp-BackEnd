import { Injectable, Logger } from "@nestjs/common";

export type TranslationResult = {
  text: string;
  detectedSourceLang?: string;
  translated: boolean; // false when we returned the input unchanged
};

// Machine translation via DeepL. Configured through env:
//   DEEPL_API_KEY  — required to enable translation
//   DEEPL_API_URL  — optional, defaults to the free endpoint
// When no key is set the service is a no-op that returns the original text, so
// the chat keeps working without translation until a key is provided.
@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private readonly apiKey = process.env.DEEPL_API_KEY || "";
  private readonly apiUrl =
    process.env.DEEPL_API_URL || "https://api-free.deepl.com/v2/translate";

  get enabled(): boolean {
    return Boolean(this.apiKey);
  }

  private normalizeTarget(lang: string): string {
    const l = (lang || "").toUpperCase();
    // DeepL wants EN-GB/EN-US for English; default to EN-GB.
    if (l === "EN") return "EN-GB";
    return l;
  }

  // Translate a batch of texts into one target language. Order is preserved.
  async translateBatch(
    texts: string[],
    targetLang: string,
  ): Promise<TranslationResult[]> {
    if (!this.enabled || !texts.length) {
      return texts.map((text) => ({ text, translated: false }));
    }

    try {
      const params = new URLSearchParams();
      params.append("target_lang", this.normalizeTarget(targetLang));
      for (const text of texts) params.append("text", text);

      const res = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          Authorization: `DeepL-Auth-Key ${this.apiKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!res.ok) {
        this.logger.warn(`DeepL responded ${res.status}`);
        return texts.map((text) => ({ text, translated: false }));
      }

      const data = (await res.json()) as {
        translations?: { text: string; detected_source_language?: string }[];
      };
      const out = data.translations || [];
      return texts.map((text, i) => {
        const t = out[i];
        if (!t) return { text, translated: false };
        return {
          text: t.text,
          detectedSourceLang: t.detected_source_language,
          translated: true,
        };
      });
    } catch (error) {
      this.logger.error("DeepL translation failed", error as Error);
      return texts.map((text) => ({ text, translated: false }));
    }
  }

  async translate(
    text: string,
    targetLang: string,
  ): Promise<TranslationResult> {
    const [result] = await this.translateBatch([text], targetLang);
    return result;
  }
}
