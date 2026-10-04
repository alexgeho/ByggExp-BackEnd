import { ChecklistItemResult } from "./schemas/checklist.enums";

// Pure helpers for AI egenkontroll — no I/O, unit-tested in the spec.

export type DraftItem = { text: string; reference: string };
export type DraftChecklist = {
  title: string;
  category: string;
  items: DraftItem[];
};

const CATEGORIES = ["quality", "environment", "work_environment", "other"];

export function normalizeDraft(raw: unknown): DraftChecklist {
  const r = (raw || {}) as Record<string, unknown>;
  const items = Array.isArray(r.items) ? r.items : [];
  return {
    title: str(r.title).slice(0, 120) || "Egenkontroll",
    category: CATEGORIES.includes(str(r.category)) ? str(r.category) : "quality",
    items: items
      .map((it) => {
        const o = (it || {}) as Record<string, unknown>;
        return {
          text: str(o.text).slice(0, 300),
          reference: str(o.reference).slice(0, 200),
        };
      })
      .filter((it) => it.text)
      .slice(0, 60),
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

export const MIN_CONFIDENCE = 0.6;

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
