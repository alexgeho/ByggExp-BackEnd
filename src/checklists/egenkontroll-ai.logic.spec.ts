import { parseJsonObject } from "../common/anthropic.client";
import {
  normalizeDraft,
  normalizeMatches,
  pendingCount,
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
    expect(d.trade).toBe("");
    expect(d.tradeInfo).toBeNull();
    expect(d.items).toEqual([
      { text: "Golvbrunn monterad", reference: "GVK", method: "", unit: "" },
    ]);
  });

  it("keeps method and unit from the model", () => {
    const d = normalizeDraft({
      items: [{ text: "Fall mot brunn", method: "Mätning", unit: "mm", reference: "" }],
    });
    expect(d.items[0]).toMatchObject({ method: "Mätning", unit: "mm" });
  });

  it("våtrum: Förkontroll underlag first, tätskikt added once", () => {
    const d = normalizeDraft({
      trade: "vatrum",
      items: [{ text: "Egenkontroll tätskikt golv" }, { text: "Golvbrunn" }],
    });
    expect(d.items.map((i) => i.text)).toEqual([
      "Förkontroll underlag",
      "Egenkontroll tätskikt golv",
      "Golvbrunn",
    ]);
  });

  it("el: adds kontroll före idrifttagning with units", () => {
    const d = normalizeDraft({ trade: "EL", items: [{ text: "Uttag monterade" }] });
    expect(d.trade).toBe("el");
    expect(d.items.slice(1).map((i) => i.unit)).toEqual(["MΩ", "Ω", "ms"]);
    expect(d.items.every((i) => !i.reference || i.reference === "SS 436 40 00")).toBe(true);
  });

  it("vvs: Säker Vatten intyg header with version 2026:1", () => {
    const d = normalizeDraft({
      trade: "vvs",
      tradeInfo: { scope: "Tappvatten kök", part: "Lgh 1101" },
      items: [{ text: "Provtryckning av ledningar", unit: "bar" }],
    });
    expect(d.tradeInfo).toEqual({
      scope: "Tappvatten kök",
      part: "Lgh 1101",
      rulesVersion: "2026:1",
    });
    expect(d.items.map((i) => i.text)).toEqual([
      "Provtryckning av ledningar",
      "Intyg om Säker Vatteninstallation upprättat",
    ]);
  });

  it("ignores unknown trades", () => {
    expect(normalizeDraft({ trade: "måleri", items: [] }).trade).toBe("");
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
      { item: 1, photo: 1, result: "ok", confidence: 0.5, reason: "a" },
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
      { item: 3, photo: 1, result: "ok", confidence: 0.2, reason: "" },
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

  it("counts unanswered points (blocks signing)", () => {
    expect(pendingCount([{ result: "ok" }, { result: "pending" }, {}])).toBe(2);
    expect(pendingCount([{ result: "ok" }, { result: "na" }])).toBe(0);
    expect(pendingCount(undefined)).toBe(0);
  });
});
