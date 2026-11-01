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
  /^\s*(>|on (mon|tue|wed|thu|fri|sat|sun)[a-z]*,|den \d{1,2} \w+\.? \d{4}|(mån|tis|ons|tors|fre|lör|sön)\w* \d{1,2} \w+ \d{4}|.*<[^>]*@tidrapportapp\.se>|-{2,}\s*(original|ursprungligt|vidarebefordrat)|_{5,}|från:|from:|skickat:|sent:|den .+ skrev|on .+ wrote|.+ skrev:?\s*$|\d{4}-\d{2}-\d{2}.+skrev)/i;

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
  /(behöver inte skicka|skicka inte (fler|mer|igen)|avregistrera|avsluta prenumeration|unsubscribe|ta bort mig|sluta skicka|stryk mig|vill inte (ha|få) (fler|mer|några))/i;
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

// Plain text of an HTML-only mail (some clients send no text part).
export const htmlToText = (html: string) =>
  String(html || "")
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<blockquote[\s\S]*$/i, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));

// Newsletters / mass mail: never a lead when it is not a campaign reply.
export const isBulk = (headers: Record<string, string | undefined>) =>
  Boolean(headers["list-unsubscribe"] || headers["list-id"]) ||
  ["bulk", "list", "junk"].includes(
    (headers["precedence"] || "").toLowerCase(),
  );

// Categories that still want an answer from us.
export const NEEDS_ANSWER = new Set(["", "interest", "later", "has_system"]);

type LeadMail = {
  email: string;
  receivedAt: Date | string | null;
  answered?: boolean;
  category: string;
  stage?: string;
};

// Where a lead stopped. Set by hand; "" = derived from the mail itself.
export const LEAD_STAGES = [
  "replied",
  "answered",
  "meeting",
  "offer",
  "won",
  "lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export function leadStage(m: LeadMail): LeadStage {
  if ((LEAD_STAGES as readonly string[]).includes(m.stage || ""))
    return m.stage as LeadStage;
  if (m.category === "no" || m.category === "unsubscribe") return "lost";
  return m.answered ? "answered" : "replied";
}

// Lead list: one row per sender — their latest real mail — with whose turn
// it is: "us" (they wrote last, unanswered) first, oldest first; then "them"
// (we answered / meeting / offer), newest first. Lost and won leads drop out.
export function leadList<T extends LeadMail>(
  mails: T[],
): (T & { turn: "us" | "them" })[] {
  const latest = new Map<string, T>();
  for (const m of mails) {
    if (m.category === "auto") continue;
    const cur = latest.get(m.email);
    if (!cur || new Date(m.receivedAt || 0) > new Date(cur.receivedAt || 0))
      latest.set(m.email, m);
  }
  const t = (m: T) => new Date(m.receivedAt || 0).getTime();
  const rows = [...latest.values()]
    .filter((m) => {
      const st = leadStage(m);
      if (st === "lost" || st === "won") return false;
      return Boolean(m.stage) || NEEDS_ANSWER.has(m.category);
    })
    .map((m): T & { turn: "us" | "them" } => ({
      ...m,
      turn: leadStage(m) === "replied" ? "us" : "them",
    }));
  return [
    ...rows.filter((r) => r.turn === "us").sort((a, b) => t(a) - t(b)),
    ...rows.filter((r) => r.turn === "them").sort((a, b) => t(b) - t(a)),
  ];
}

// "Att svara": one row per sender — their latest mail, when it is unanswered
// and still wants an answer. Oldest waiting first. Auto-replies and empty
// follow-ups ("auto") never hide the real mail before them.
export function waitingLeads<T extends LeadMail>(mails: T[]): T[] {
  const latest = new Map<string, T>();
  for (const m of mails) {
    if (m.category === "auto") continue;
    const cur = latest.get(m.email);
    if (!cur || new Date(m.receivedAt || 0) > new Date(cur.receivedAt || 0))
      latest.set(m.email, m);
  }
  return [...latest.values()]
    .filter((m) => !m.answered && !m.stage && NEEDS_ANSWER.has(m.category))
    .sort(
      (a, b) =>
        new Date(a.receivedAt || 0).getTime() -
        new Date(b.receivedAt || 0).getTime(),
    );
}

// A site form mail ("Namn/företag: …, Kontakt: …") sent from our own domain:
// the lead is the visitor — Reply-To, else the e-mail or phone in the text.
// Phone-only leads get "tel 0707…" (digits only) as their key. null = our
// own test or nothing to reach the visitor by.
export function formLead(
  text: string,
  replyTo: string,
  ownDomain: string,
): { email: string; name: string } | null {
  const field = (re: RegExp) => (text.match(re)?.[1] || "").trim();
  const name =
    field(/^\s*Namn(?:\s*\/\s*företag)?\s*:\s*(.+)$/im) ||
    field(/^\s*Namn \/ företag\s*\n?\s*(.+)$/im);
  const contact = [
    field(/^\s*Kontakt\s*:\s*(.+)$/im),
    field(/^\s*E-post\s*:\s*(.+)$/im),
    field(/^\s*Telefon\s*:\s*(.+)$/im),
  ].join(" ");
  const mail =
    (replyTo && domainOf(replyTo) !== ownDomain ? replyTo : "") ||
    (contact.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] || "").toLowerCase();
  const digits = (contact.match(/\+?\d[\d\s-]{6,}\d/)?.[0] || "").replace(
    /\D/g,
    "",
  );
  const all = `${name} ${mail} ${contact}`;
  if (/\btest\b|example\.com|test@|diagnostik/i.test(all)) return null;
  if (mail && domainOf(mail) === ownDomain) return null;
  if (mail) return { email: mail.toLowerCase(), name };
  if (digits.length >= 7) return { email: `tel ${digits}`, name };
  return null;
}

// Key for comparing a lead with a sheet cell: "Tel 0707-93 12 02" and
// "tel 0707931202" are the same lead.
export const leadKey = (s: string) =>
  String(s || "")
    .toLowerCase()
    .replace(/^tel[:\s]*/, "tel")
    .replace(/[^a-z0-9@._+-]/g, "")
    .replace(/-/g, "");
