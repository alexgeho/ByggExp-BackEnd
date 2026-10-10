// Pure helpers for reading replies out of the inbox (unit-tested).

// Free mailboxes: a reply from the same domain says nothing about the firm.
const GENERIC_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.se",
  "outlook.com",
  "outlook.se",
  "live.com",
  "live.se",
  "msn.com",
  "yahoo.com",
  "yahoo.se",
  "icloud.com",
  "me.com",
  "mac.com",
  "telia.com",
  "telia.se",
  "bredband.net",
  "bahnhof.se",
  "spray.se",
  "comhem.se",
  "tele2.se",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "gmx.se",
  "mail.com",
]);

export const domainOf = (email: string) =>
  String(email || "")
    .toLowerCase()
    .split("@")[1]
    ?.trim() || "";

export const isCompanyDomain = (domain: string) =>
  Boolean(domain) && !GENERIC_DOMAINS.has(domain);

const SYSTEM_SENDER =
  /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce)/i;
export const isSystemSender = (email: string) => SYSTEM_SENDER.test(email);

const AUTO_SUBJECT =
  /^(autosvar|automatiskt svar|auto(matic)?[ -]?reply|out of office|frånvaro|abwesenheit|autosvar:|ikke til stede|fraværende)/i;

export const isAutoReply = (
  subject: string,
  headers: Record<string, string | undefined>,
) => {
  const auto = (headers["auto-submitted"] || "").toLowerCase();
  if (auto && auto !== "no") return true;
  if (headers["x-autoreply"] || headers["x-autorespond"]) return true;
  const prec = (headers["precedence"] || "").toLowerCase();
  if (prec === "auto_reply") return true;
  return AUTO_SUBJECT.test(String(subject || "").trim());
};

// Where the quoted original starts in a reply (Swedish + English clients).
const QUOTE_START =
  /^\s*(>|-{2,}\s*(original|ursprungligt|vidarebefordrat)|_{5,}|från:|from:|skickat:|sent:|den .+ skrev|on .+ wrote|.+ skrev:?\s*$|\d{4}-\d{2}-\d{2}.+skrev)/i;

// The person's own words: text before the quote, whitespace collapsed.
export const replySnippet = (text: string, max = 400) => {
  const lines: string[] = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    if (QUOTE_START.test(line)) break;
    lines.push(line);
  }
  return lines.join(" ").replace(/\s+/g, " ").trim().slice(0, max);
};

const UNSUBSCRIBE =
  /(avregistrera|avsluta prenumeration|unsubscribe|ta bort mig|sluta skicka|stryk mig|vill inte (ha|få) (fler|mer|några))/i;
export const asksToUnsubscribe = (snippet: string) => UNSUBSCRIBE.test(snippet);

// Fallback when AI is off/failing: obvious Swedish/English phrasings only.
const HAS_SYSTEM =
  /(har redan|använder redan|vi använder|vi kör|kör med|eget system|egen app|annat system|nöjda med|already (use|have)|softone|fortnox|bygglet|visma|hantverksdata|entreprenörsappen|kvalitetsdokument|smartdok|tidrapport-?app)/i;
const LATER =
  /(senare|inte just nu|längre fram|hör av mig|återkommer|när vi anställer|inga anställda|later|not right now)/i;
const INTEREST =
  /(ring mig|ring på|kan du ringa|boka|demo|intresserad av|låter intressant|vill gärna|skicka mer info|call me|interested in)/i;
const JUST_NO =
  /^(nej|nej tack|no|no thanks|inte intresserad|ej intresserad|inte aktuellt|not interested)\b|inte intresserad|ej intresserad|inte aktuellt|nej tack|not interested|no thanks/i;

export const guessCategory = (
  snippet: string,
): "" | "interest" | "later" | "has_system" | "no" | "unsubscribe" => {
  const s = String(snippet || "");
  if (asksToUnsubscribe(s)) return "unsubscribe";
  if (HAS_SYSTEM.test(s)) return "has_system";
  if (LATER.test(s)) return "later";
  if (INTEREST.test(s)) return "interest";
  if (JUST_NO.test(s)) return "no";
  return "";
};
