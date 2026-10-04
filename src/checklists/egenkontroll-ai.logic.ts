import { ChecklistItemResult } from "./schemas/checklist.enums";

// Pure helpers for AI egenkontroll — no I/O, unit-tested in the spec.

export type DraftItem = {
  text: string;
  reference: string;
  method: string;
  unit: string;
};
export type DraftTradeInfo = { scope: string; part: string; rulesVersion: string };
export type DraftChecklist = {
  title: string;
  category: string;
  trade: string; // "vvs" | "vatrum" | "el" | ""
  tradeInfo: DraftTradeInfo | null;
  items: DraftItem[];
};

const CATEGORIES = ["quality", "environment", "work_environment", "other"];
export const TRADES = ["vvs", "vatrum", "el"];

// Säker Vatten branschregler version written on the intyg.
export const SAKER_VATTEN_VERSION = "2026:1";

const point = (text: string, reference: string, method: string, unit = ""): DraftItem => ({
  text,
  reference,
  method,
  unit,
});

// Points each trade must contain. `key` matches an existing AI point
// (case-insensitive) so a preset point is only added when it is missing.
// References are the governing rules only — nothing invented.
const TRADE_POINTS: Record<string, { key: RegExp; item: DraftItem; first?: boolean }[]> = {
  vatrum: [
    {
      key: /förkontroll/i,
      item: point("Förkontroll underlag", "GVK Säkra Våtrum", "Visuell kontroll"),
      first: true,
    },
    {
      key: /egenkontroll tätskikt/i,
      item: point("Egenkontroll tätskikt", "GVK Säkra Våtrum", "Visuell kontroll"),
    },
  ],
  vvs: [
    {
      key: /täthet|provtryck|tryckprov/i,
      item: point("Täthetskontroll tappvatteninstallation", "Säker Vatten", "Provtryckning", "bar"),
    },
    {
      key: /intyg om säker vatten/i,
      item: point("Intyg om Säker Vatteninstallation upprättat", "Säker Vatten", "Dokumentkontroll"),
    },
  ],
  el: [
    {
      key: /isolationsresistans/i,
      item: point(
        "Kontroll före idrifttagning – isolationsresistans",
        "SS 436 40 00",
        "Mätning",
        "MΩ",
      ),
    },
    {
      key: /kontinuitet/i,
      item: point(
        "Kontroll före idrifttagning – kontinuitet skyddsledare",
        "SS 436 40 00",
        "Mätning",
        "Ω",
      ),
    },
    {
      key: /jordfelsbrytare/i,
      item: point(
        "Kontroll före idrifttagning – jordfelsbrytare, utlösningstid",
        "SS 436 40 00",
        "Provning",
        "ms",
      ),
    },
  ],
};

export function normalizeDraft(raw: unknown): DraftChecklist {
  const r = (raw || {}) as Record<string, unknown>;
  const list = Array.isArray(r.items) ? r.items : [];
  const trade = TRADES.includes(str(r.trade).toLowerCase()) ? str(r.trade).toLowerCase() : "";
  let items: DraftItem[] = list
    .map((it) => {
      const o = (it || {}) as Record<string, unknown>;
      return {
        text: str(o.text).slice(0, 300),
        reference: str(o.reference).slice(0, 200),
        method: str(o.method).slice(0, 80),
        unit: str(o.unit).slice(0, 12),
      };
    })
    .filter((it) => it.text);
  for (const preset of TRADE_POINTS[trade] || []) {
    if (items.some((it) => preset.key.test(it.text))) continue;
    items = preset.first ? [preset.item, ...items] : [...items, preset.item];
  }
  const info = (r.tradeInfo || {}) as Record<string, unknown>;
  return {
    title: str(r.title).slice(0, 120) || "Egenkontroll",
    category: CATEGORIES.includes(str(r.category)) ? str(r.category) : "quality",
    trade,
    // Säker Vatten intyg header: omfattning, byggnad/del, branschregler.
    tradeInfo:
      trade === "vvs"
        ? {
            scope: str(info.scope).slice(0, 200),
            part: str(info.part).slice(0, 200),
            rulesVersion: SAKER_VATTEN_VERSION,
          }
        : null,
    items: items.slice(0, 60),
  };
}

export type PhotoMatch = {
  item: number; // 1-based item number as shown to the model
  photo: number; // 1-based photo number as shown to the model
  result: string;
  confidence: number;
  reason: string;
};

export type AiPhoto = { url: string; date: string }; // date = YYYY-MM-DD

export type SuggestionInput = {
  result?: string;
  suggestion?: { state?: string } | null;
};

export type NewSuggestion = {
  index: number; // 0-based item index
  result: ChecklistItemResult;
  date: string;
  photoUrl: string;
  reason: string;
  confidence: number;
};

// Low on purpose: the model is conservative and a human approves every
// suggestion anyway.
export const MIN_CONFIDENCE = 0.4;

export function normalizeMatches(raw: unknown): PhotoMatch[] {
  const r = (raw || {}) as Record<string, unknown>;
  const list = Array.isArray(r.matches) ? r.matches : [];
  return list.map((m) => {
    const o = (m || {}) as Record<string, unknown>;
    const c = Number(o.confidence);
    return {
      item: Math.trunc(Number(o.item)),
      photo: Math.trunc(Number(o.photo)),
      result: str(o.result),
      confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0,
      reason: str(o.reason).slice(0, 300),
    };
  });
}

// Picks at most one suggestion per open item: the most confident valid match.
// Items already answered, or whose suggestion was accepted/rejected, are left
// alone — the AI never overrides a human decision.
export function pickSuggestions(
  items: SuggestionInput[],
  photos: AiPhoto[],
  matches: PhotoMatch[],
): NewSuggestion[] {
  const best = new Map<number, NewSuggestion>();
  for (const m of matches) {
    const index = m.item - 1;
    const photo = photos[m.photo - 1];
    const item = items[index];
    if (!item || !photo) continue;
    if (m.result !== "ok" && m.result !== "remark") continue;
    if (m.confidence < MIN_CONFIDENCE) continue;
    if (item.result && item.result !== ChecklistItemResult.Pending) continue;
    const state = item.suggestion?.state;
    if (state === "accepted" || state === "rejected") continue;
    const prev = best.get(index);
    if (prev && prev.confidence >= m.confidence) continue;
    best.set(index, {
      index,
      result: m.result as ChecklistItemResult,
      date: photo.date,
      photoUrl: photo.url,
      reason: m.reason,
      confidence: m.confidence,
    });
  }
  return [...best.values()].sort((a, b) => a.index - b.index);
}

export function toIsoDate(d?: Date | string | null): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}
