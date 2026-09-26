import { promises as dns } from "dns";
import { escapeHtml } from "../newsletters/newsletter-render";
import { signLink } from "./mailer-crypto";

// Per-recipient post-processing of a rendered newsletter: merge tags, click
// and open tracking. Pure (except the MX lookup at the bottom) so it's tested
// in isolation.

export type RecipientInfo = { email: string; name: string; company: string };

const TAGS: Record<string, keyof RecipientInfo> = {
  namn: "name",
  name: "name",
  foretag: "company",
  företag: "company",
  company: "company",
  email: "email",
  epost: "email",
};

// {{namn}}, {{företag}}, {{email}} — with an optional fallback: {{namn|där}}.
export function applyMergeTags(
  text: string,
  r: RecipientInfo,
  html: boolean,
): string {
  return text.replace(
    /\{\{\s*([\wåäö]+)\s*(?:\|([^}]*))?\}\}/gi,
    (m, tag: string, fallback?: string) => {
      const field = TAGS[tag.toLowerCase()];
      if (!field) return m;
      const value = (r[field] || "").trim() || (fallback ?? "").trim();
      return html ? escapeHtml(value) : value;
    },
  );
}

export const unsubscribeUrlFor = (apiBase: string, token: string) =>
  `${apiBase}/m/u/${token}`;

const unescapeAttr = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

export function addTracking(
  html: string,
  opts: {
    apiBase: string;
    token: string;
    trackClicks: boolean;
    trackOpens: boolean;
  },
): string {
  let out = html;
  const unsubscribe = unsubscribeUrlFor(opts.apiBase, opts.token);
  if (opts.trackClicks) {
    out = out.replace(/href="(https?:\/\/[^"]+)"/g, (m, raw: string) => {
      const url = unescapeAttr(raw);
      if (url === unsubscribe) return m; // never wrap the unsubscribe link
      const sig = signLink(opts.token, url);
      const tracked = `${opts.apiBase}/m/c/${opts.token}?u=${encodeURIComponent(url)}&s=${sig}`;
      return `href="${escapeHtml(tracked)}"`;
    });
  }
  if (opts.trackOpens) {
    const pixel = `<img src="${opts.apiBase}/m/o/${opts.token}.gif" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;">`;
    out = out.includes("</body>")
      ? out.replace("</body>", `${pixel}\n</body>`)
      : out + pixel;
  }
  return out;
}

// ---------- address checks ----------

const EMAIL_RE = /^[^\s@"<>(),;:]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

export const normalizeEmail = (raw: unknown) =>
  String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^mailto:/, "");

export const isValidEmailSyntax = (email: string) =>
  email.length <= 254 && EMAIL_RE.test(email);

// "Kontrollerad": the domain accepts mail (has MX, or an A record fallback).
export async function checkDomain(
  domain: string,
  timeoutMs = 5000,
): Promise<{ ok: boolean; note: string }> {
  const withTimeout = <T>(p: Promise<T>) =>
    Promise.race([
      p,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs),
      ),
    ]);
  try {
    const mx = await withTimeout(dns.resolveMx(domain));
    if (mx.length) return { ok: true, note: "" };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "ENODATA" && code !== "ENOTFOUND") {
      // DNS hiccup: don't condemn the address, just leave it unverified.
      return { ok: true, note: "dns-unavailable" };
    }
  }
  try {
    const a = await withTimeout(dns.resolve4(domain));
    if (a.length) return { ok: true, note: "no-mx-a-record" };
  } catch {
    /* fall through */
  }
  return { ok: false, note: "Domänen tar inte emot e-post" };
}
