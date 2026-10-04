import { parseJsonObject } from "../common/anthropic.client";
import {
  normalizeDraft,
  normalizeMatches,
  pickSuggestions,
  toIsoDate,
} from "./egenkontroll-ai.logic";

const photos = [
  { url: "/uploads/checklist-photos/a.jpg", date: "2026-10-01" },
  { url: "/uploads/checklist-photos/b.jpg", date: "2026-10-02" },
];

describe("egenkontroll AI logic", () => {
  it("parses a fenced JSON reply", () => {
    const reply = 'Här:\n```json\n{"title":"Badrum","items":[{"text":"Tätskikt"}]}\n```';
    expect(parseJsonObject(reply)).toEqual({ title: "Badrum", items: [{ text: "Tätskikt" }] });
  });

  it("normalizes a draft: drops empty points, defaults category and title", () => {
    const d = normalizeDraft({
      category: "nonsense",
      items: [{ text: " Golvbrunn monterad ", reference: "GVK" }, { text: "" }, null],
    });
    expect(d.title).toBe("Egenkontroll");
    expect(d.category).toBe("quality");
    expect(d.items).toEqual([{ text: "Golvbrunn monterad", reference: "GVK" }]);
  });

  it("clamps confidence and coerces numbers in matches", () => {
    const m = normalizeMatches({
      matches: [{ item: "2", photo: 1, result: "ok", confidence: 7, reason: "x" }],
    });
    expect(m[0]).toMatchObject({ item: 2, photo: 1, confidence: 1 });
    expect(normalizeMatches({})).toEqual([]);
  });

  it("keeps the most confident match per item, with the photo's date", () => {
    const items = [{ result: "pending" }, { result: "pending" }];
    const s = pickSuggestions(items, photos, [
      { item: 1, photo: 1, result: "ok", confidence: 0.7, reason: "a" },
      { item: 1, photo: 2, result: "ok", confidence: 0.9, reason: "b" },
    ]);
    expect(s).toEqual([
      {
        index: 0,
        result: "ok",
        date: "2026-10-02",
        photoUrl: photos[1].url,
        reason: "b",
        confidence: 0.9,
      },
    ]);
  });

  it("never overrides a human decision or weak/invalid matches", () => {
    const items = [
      { result: "ok" },
      { result: "pending", suggestion: { state: "rejected" } },
      { result: "pending" },
      { result: "pending" },
    ];
    const s = pickSuggestions(items, photos, [
      { item: 1, photo: 1, result: "ok", confidence: 0.9, reason: "" },
      { item: 2, photo: 1, result: "ok", confidence: 0.9, reason: "" },
      { item: 3, photo: 1, result: "ok", confidence: 0.3, reason: "" },
      { item: 4, photo: 9, result: "ok", confidence: 0.9, reason: "" },
      { item: 4, photo: 1, result: "na", confidence: 0.9, reason: "" },
      { item: 99, photo: 1, result: "ok", confidence: 0.9, reason: "" },
    ]);
    expect(s).toEqual([]);
  });

  it("formats dates and tolerates bad input", () => {
    expect(toIsoDate(new Date("2026-10-04T12:00:00Z"))).toBe("2026-10-04");
    expect(toIsoDate("garbage")).toBe("");
    expect(toIsoDate(null)).toBe("");
  });
});
