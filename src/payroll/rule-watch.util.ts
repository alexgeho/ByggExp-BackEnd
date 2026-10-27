import { createHash } from "crypto";

// Reduces a fetched page to the text a person reads, so markup churn (script
// hashes, tracking ids, CSRF tokens) never counts as a change.
export function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function textHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// The main content of most sites sits after the navigation; skipping the
// first part keeps the excerpt meaningful.
export function excerpt(text: string, length = 600): string {
  const start = Math.min(Math.floor(text.length / 5), 1500);
  return text.slice(start, start + length);
}

// Default watch list. Superadmins can add, disable or re-point sources.
export const DEFAULT_RULE_SOURCES = [
  {
    key: "byggnads-avtal",
    name: "Byggnads — kollektivavtal",
    url: "https://www.byggnads.se/stod-pa-jobbet/byggnads-kollektivavtal/ditt-kollektivavtal/",
    area: "agreement",
  },
  {
    key: "byggnads-avtalsrorelsen",
    name: "Byggnads — avtalsrörelsen",
    url: "https://www.byggnads.se/stod-pa-jobbet/byggnads-kollektivavtal/avtalsrorelsen/",
    area: "agreement",
  },
  {
    key: "skv-skattetabeller",
    name: "Skatteverket — skattetabeller (filer)",
    url: "https://skatteverket.se/specialversionerforprogramforetagmfl.4.319dc1451507f2f99e86ee.html",
    area: "tax",
  },
  {
    key: "skv-traktamente",
    name: "Skatteverket — traktamente och bilersättning",
    url: "https://www.skatteverket.se/foretag/arbetsgivare/lonochersattning/traktamenteochbilersattning",
    area: "tax",
  },
  {
    key: "skv-arbetsgivaravgifter",
    name: "Skatteverket — arbetsgivaravgifter",
    url: "https://skatteverket.se/arbetsgivaravgifter",
    area: "tax",
  },
  {
    key: "skv-agi-teknisk",
    name: "Skatteverket — AGI teknisk beskrivning",
    url: "https://skatteverket.se/foretag/arbetsgivare/lamnaarbetsgivardeklaration/tekniskbeskrivningochtesttjanst.4.309a41aa1672ad0c8377c8b.html",
    area: "agi",
  },
] as const;
