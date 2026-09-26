// Renders a newsletter (settings + ordered content blocks) to e-mail-safe HTML:
// a 600px table layout with inline styles only, so it survives Gmail, Outlook
// and Roundcube. Pure functions — the admin editor's live preview, test sends
// and (later) bulk sends all go through here, so what you see is what is sent.

export const UNSUBSCRIBE_PLACEHOLDER = "{{unsubscribe_url}}";

export type NewsletterSettings = {
  // "newsletter" = designed mailing; "personal" = plain personal letter
  // (no logo/menu, left-aligned) for cold outreach.
  layout: "newsletter" | "personal";
  preheader: string;
  brandColor: string;
  accentColor: string;
  logoUrl: string;
  logoWidth: number;
  logoHref: string;
  navLinks: { label: string; href: string }[];
  footerAbout: string;
  footerEmail: string;
  footerPhone: string;
  footerAddress: string;
  utmCampaign: string;
};

export type NewsletterBlock =
  | {
      id: string;
      type: "image";
      src: string;
      alt: string;
      href: string;
      fullWidth: boolean;
    }
  | { id: string; type: "heading"; text: string; level: "h1" | "h2" }
  | { id: string; type: "text"; text: string; muted: boolean }
  | {
      id: string;
      type: "button";
      label: string;
      href: string;
      variant: "filled" | "outline";
    }
  | {
      id: string;
      type: "card";
      title: string;
      text: string;
      image: string;
      imageAlt: string;
      href: string;
      linkLabel: string;
    }
  | { id: string; type: "spacer"; height: number }
  | { id: string; type: "divider" };

export type BlockType = NewsletterBlock["type"];
export const BLOCK_TYPES: BlockType[] = [
  "image",
  "heading",
  "text",
  "button",
  "card",
  "spacer",
  "divider",
];

export const DEFAULT_SETTINGS: NewsletterSettings = {
  layout: "newsletter",
  preheader: "",
  brandColor: "#0f2350",
  accentColor: "#1c6cf3",
  logoUrl: "https://admin.byggexp.se/newsletter-template/byggexp-logo.png",
  logoWidth: 200,
  logoHref: "https://byggexp.se/sv",
  navLinks: [
    { label: "HEMSIDA", href: "https://byggexp.se/sv" },
    { label: "FUNKTIONER & PRISER", href: "https://byggexp.se/sv/funktioner" },
    { label: "KONTAKT", href: "https://byggexp.se/sv/contact" },
  ],
  footerAbout:
    "ByggExp är ett digitalt verktyg för bygg- och hantverksföretag – tidrapportering, planering, projekt och ekonomi i en app.",
  footerEmail: "support@byggexp.se",
  footerPhone: "070-757 75 75",
  footerAddress: "",
  utmCampaign: "",
};

// ---------- sanitising helpers ----------

const str = (v: unknown, max = 5000) =>
  typeof v === "string" ? v.slice(0, max) : "";

const HEX = /^#[0-9a-fA-F]{6}$/;
const color = (v: unknown, fallback: string) =>
  typeof v === "string" && HEX.test(v) ? v : fallback;

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Only http(s), mailto:, tel: and the unsubscribe placeholder survive; anything
// else (javascript:, data:, relative paths) collapses to "#".
export function safeUrl(raw: unknown): string {
  const url = str(raw, 2000).trim();
  if (!url) return "";
  if (url === UNSUBSCRIBE_PLACEHOLDER) return url;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) return url;
  return "#";
}

// Tags links to our own sites with UTM parameters so the campaign shows up in GA.
export function withUtm(url: string, campaign: string): string {
  if (!campaign || !/^https?:\/\//i.test(url)) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!/(^|\.)byggexp\.se$/i.test(parsed.hostname)) return url;
  if (parsed.searchParams.has("utm_source")) return url;
  parsed.searchParams.set("utm_source", "nyhetsbrev");
  parsed.searchParams.set("utm_medium", "email");
  parsed.searchParams.set("utm_campaign", campaign);
  return parsed.toString();
}

export function normalizeSettings(raw: unknown): NewsletterSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const d = DEFAULT_SETTINGS;
  const nav = Array.isArray(r.navLinks) ? r.navLinks : d.navLinks;
  return {
    layout: r.layout === "personal" ? "personal" : "newsletter",
    preheader: str(r.preheader ?? d.preheader, 300),
    brandColor: color(r.brandColor, d.brandColor),
    accentColor: color(r.accentColor, d.accentColor),
    logoUrl: str(r.logoUrl ?? d.logoUrl, 2000),
    logoWidth: clampInt(r.logoWidth, 60, 400, d.logoWidth),
    logoHref: str(r.logoHref ?? d.logoHref, 2000),
    navLinks: nav
      .slice(0, 5)
      .map((l) => {
        const o = (l && typeof l === "object" ? l : {}) as Record<
          string,
          unknown
        >;
        return { label: str(o.label, 60), href: str(o.href, 2000) };
      })
      .filter((l) => l.label),
    footerAbout: str(r.footerAbout ?? d.footerAbout, 1000),
    footerEmail: str(r.footerEmail ?? d.footerEmail, 200),
    footerPhone: str(r.footerPhone ?? d.footerPhone, 60),
    footerAddress: str(r.footerAddress ?? d.footerAddress, 300),
    utmCampaign: str(r.utmCampaign ?? d.utmCampaign, 80).replace(
      /[^\w.-]/g,
      "-",
    ),
  };
}

export function normalizeBlocks(raw: unknown): NewsletterBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: NewsletterBlock[] = [];
  raw.slice(0, 100).forEach((item, i) => {
    const b = (item && typeof item === "object" ? item : {}) as Record<
      string,
      unknown
    >;
    const id = str(b.id, 40) || `b${i}`;
    switch (b.type) {
      case "image":
        out.push({
          id,
          type: "image",
          src: str(b.src, 2000),
          alt: str(b.alt, 300),
          href: str(b.href, 2000),
          fullWidth: Boolean(b.fullWidth),
        });
        break;
      case "heading":
        out.push({
          id,
          type: "heading",
          text: str(b.text, 300),
          level: b.level === "h1" ? "h1" : "h2",
        });
        break;
      case "text":
        out.push({
          id,
          type: "text",
          text: str(b.text, 5000),
          muted: Boolean(b.muted),
        });
        break;
      case "button":
        out.push({
          id,
          type: "button",
          label: str(b.label, 80),
          href: str(b.href, 2000),
          variant: b.variant === "outline" ? "outline" : "filled",
        });
        break;
      case "card":
        out.push({
          id,
          type: "card",
          title: str(b.title, 300),
          text: str(b.text, 3000),
          image: str(b.image, 2000),
          imageAlt: str(b.imageAlt, 300),
          href: str(b.href, 2000),
          linkLabel: str(b.linkLabel, 80),
        });
        break;
      case "spacer":
        out.push({
          id,
          type: "spacer",
          height: clampInt(b.height, 8, 160, 40),
        });
        break;
      case "divider":
        out.push({ id, type: "divider" });
        break;
      default:
        break; // unknown block types are dropped
    }
  });
  return out;
}

// ---------- inline formatting ----------

// Escapes, then allows a tiny markdown subset: **bold**, *italic*,
// [label](url) links and line breaks (blank line = new paragraph gap).
export function inlineFormat(
  text: string,
  linkColor: string,
  utm: string,
): string {
  let html = escapeHtml(text);
  html = html.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label: string, url: string) => {
      // The URL was escaped above; undo &amp; so query strings keep working.
      const href = withUtm(safeUrl(url.replace(/&amp;/g, "&")), utm);
      return `<a href="${escapeHtml(href)}" style="color:${linkColor};">${label}</a>`;
    },
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  html = html.replace(/\*([^*]+)\*/g, "<i>$1</i>");
  html = html.replace(/\r?\n\r?\n/g, "<br><br>").replace(/\r?\n/g, "<br>");
  return html;
}

// ---------- block renderers ----------

const FONT = "Helvetica,Arial,sans-serif";
const MUTED = "#8a94a6";

type Ctx = {
  s: NewsletterSettings;
  href: (u: string) => string;
  personal: boolean;
};

// Personal letters are left-aligned and full-width; newsletters centred.
const al = (c: Ctx) => (c.personal ? "left" : "center");
const hp = (c: Ctx, v: string) => (c.personal ? "0" : v);
const textColor = (c: Ctx, fallback: string) =>
  c.personal ? "#1f2937" : fallback;

function renderButton(
  label: string,
  href: string,
  variant: "filled" | "outline",
  ctx: Ctx,
) {
  const { brandColor, accentColor } = ctx.s;
  const cell =
    variant === "filled"
      ? `bgcolor="${accentColor}" style="border-radius:24px;"`
      : `style="border:2px solid ${brandColor};border-radius:24px;"`;
  const textColor = variant === "filled" ? "#ffffff" : brandColor;
  return `<tr><td align="${al(ctx)}" style="padding:8px 0 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="${al(ctx)}" ${cell}><a href="${escapeHtml(ctx.href(href))}" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:bold;color:${textColor};text-decoration:none;">${escapeHtml(label)}</a></td>
</tr></table></td></tr>`;
}

function renderImage(
  src: string,
  alt: string,
  href: string,
  fullWidth: boolean,
  ctx: Ctx,
) {
  if (!src) return "";
  const width = fullWidth ? 600 : 440;
  const pad = fullWidth ? "0" : hp(ctx, "0 80px");
  const img = `<img src="${escapeHtml(safeUrl(src))}" width="${width}" alt="${escapeHtml(alt)}" class="${fullWidth ? "" : "nl-narrow"}" style="display:block;width:${width}px;max-width:100%;height:auto;border:0;">`;
  const link = href
    ? `<a href="${escapeHtml(ctx.href(href))}">${img}</a>`
    : img;
  return `<tr><td align="${al(ctx)}" class="${fullWidth ? "" : "nl-px"}" style="padding:${pad};">${link}</td></tr>`;
}

function renderBlock(b: NewsletterBlock, ctx: Ctx): string {
  const { brandColor, utmCampaign } = ctx.s;
  switch (b.type) {
    case "image":
      return renderImage(b.src, b.alt, b.href, b.fullWidth, ctx);
    case "heading": {
      const size = b.level === "h1" ? 28 : 24;
      return `<tr><td align="${al(ctx)}" class="nl-px" style="padding:24px ${hp(ctx, "60px")} 6px;">
<${b.level} class="nl-h" style="margin:0;font-family:${FONT};font-size:${size}px;line-height:${size + 6}px;font-weight:bold;color:${brandColor};">${escapeHtml(b.text)}</${b.level}>
</td></tr>`;
    }
    case "text":
      return `<tr><td align="${al(ctx)}" class="nl-px" style="padding:12px ${hp(ctx, "80px")} 20px;font-family:${FONT};font-size:15px;line-height:22px;color:${b.muted ? MUTED : textColor(ctx, brandColor)};">${inlineFormat(b.text, ctx.s.accentColor, utmCampaign)}</td></tr>`;
    case "button":
      return b.label ? renderButton(b.label, b.href, b.variant, ctx) : "";
    case "card": {
      const parts = [
        b.title
          ? `<tr><td align="${al(ctx)}" class="nl-px" style="padding:24px ${hp(ctx, "60px")} 6px;"><h2 class="nl-h" style="margin:0;font-family:${FONT};font-size:24px;line-height:30px;font-weight:bold;color:${brandColor};">${escapeHtml(b.title)}</h2></td></tr>`
          : "",
        b.text
          ? `<tr><td align="${al(ctx)}" class="nl-px" style="padding:12px ${hp(ctx, "80px")} 22px;font-family:${FONT};font-size:15px;line-height:22px;color:${brandColor};">${inlineFormat(b.text, ctx.s.accentColor, utmCampaign)}</td></tr>`
          : "",
        renderImage(b.image, b.imageAlt || b.title, b.href, false, ctx),
        b.linkLabel && b.href
          ? `<tr><td align="${al(ctx)}" style="padding:18px 20px 8px;font-family:${FONT};font-size:13px;"><a href="${escapeHtml(ctx.href(b.href))}" style="color:${MUTED};font-weight:bold;text-decoration:none;">${escapeHtml(b.linkLabel)}</a></td></tr>`
          : "",
      ];
      return parts.join("\n");
    }
    case "spacer":
      return `<tr><td style="height:${b.height}px;line-height:${b.height}px;font-size:0;">&nbsp;</td></tr>`;
    case "divider":
      return `<tr><td class="nl-px" style="padding:16px ${hp(ctx, "80px")};"><div style="border-top:1px solid #e3e8f0;font-size:0;line-height:0;">&nbsp;</div></td></tr>`;
  }
}

export type RenderOptions = {
  subject: string;
  // Real per-recipient link at send time; falls back to the placeholder so the
  // stored/downloaded HTML can be filled in by whatever tool sends it.
  unsubscribeUrl?: string;
};

export function renderNewsletterHtml(
  rawSettings: unknown,
  rawBlocks: unknown,
  opts: RenderOptions,
): string {
  const s = normalizeSettings(rawSettings);
  const blocks = normalizeBlocks(rawBlocks);
  const ctx: Ctx = {
    s,
    href: (u) => withUtm(safeUrl(u), s.utmCampaign),
    personal: s.layout === "personal",
  };
  const unsubscribe = opts.unsubscribeUrl || UNSUBSCRIBE_PLACEHOLDER;

  const logo = s.logoUrl
    ? `<tr><td align="center" style="padding:36px 20px 18px;">${
        s.logoHref ? `<a href="${escapeHtml(ctx.href(s.logoHref))}">` : ""
      }<img src="${escapeHtml(safeUrl(s.logoUrl))}" width="${s.logoWidth}" alt="Logo" style="display:block;width:${s.logoWidth}px;max-width:100%;height:auto;border:0;">${s.logoHref ? "</a>" : ""}</td></tr>`
    : `<tr><td style="height:24px;"></td></tr>`;

  const nav = s.navLinks.length
    ? `<tr><td align="center" style="padding:0 10px 18px;font-family:${FONT};font-size:12px;letter-spacing:.5px;">${s.navLinks
        .map(
          (l) =>
            `<a href="${escapeHtml(ctx.href(l.href))}" class="nl-nav" style="display:inline-block;white-space:nowrap;color:${s.brandColor};text-decoration:none;padding:4px 10px;">${escapeHtml(l.label)}</a>`,
        )
        .join("")}</td></tr>`
    : "";

  const contact = [
    s.footerEmail
      ? `<a href="mailto:${escapeHtml(s.footerEmail)}" style="color:#4a7fc1;">${escapeHtml(s.footerEmail)}</a>`
      : "",
    s.footerPhone
      ? `<a href="tel:${escapeHtml(s.footerPhone.replace(/[^\d+]/g, ""))}" style="color:#4a7fc1;">${escapeHtml(s.footerPhone)}</a>`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const footer = `<tr><td style="height:40px;"></td></tr>
<tr><td align="center" class="nl-px" style="padding:0 70px 16px;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">${escapeHtml(s.footerAbout)}</td></tr>
${contact ? `<tr><td align="center" style="padding:0 20px 12px;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">Om du har några frågor finns vi här för att hjälpa dig:<br>${contact}</td></tr>` : ""}
${s.footerAddress ? `<tr><td align="center" style="padding:0 20px 12px;font-family:${FONT};font-size:13px;color:${MUTED};">${escapeHtml(s.footerAddress)}</td></tr>` : ""}
<tr><td align="center" style="padding:8px 20px 50px;font-family:${FONT};font-size:12px;"><a href="${escapeHtml(unsubscribe)}" style="color:${s.brandColor};">Vill du inte längre få våra nyhetsbrev? Avregistrera</a></td></tr>`;

  const blockRows = blocks.map((b) => renderBlock(b, ctx)).join("\n");

  // Personal letter: just the text, then a small grey footer with the
  // legally required sender details and unsubscribe link.
  const personalFooter = [s.footerAddress, s.footerEmail]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");
  const personalBody = `<tr><td class="nl-px" style="padding:28px 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${blockRows}
</table></td></tr>
<tr><td class="nl-px" style="padding:28px 24px 40px;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">${personalFooter ? `${personalFooter}<br>` : ""}<a href="${escapeHtml(unsubscribe)}" style="color:${MUTED};">Vill du inte få fler mejl från oss? Avregistrera</a></td></tr>`;

  const preheader = s.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(s.preheader)}${"&#8199;&#847;".repeat(40)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(opts.subject || "")}</title>
<style>
body{margin:0;padding:0;background:#ffffff;}
@media only screen and (max-width:620px){
  .nl-w{width:100%!important;}
  .nl-px{padding-left:20px!important;padding-right:20px!important;}
  .nl-narrow{width:100%!important;}
  .nl-h{font-size:22px!important;line-height:28px!important;}
  .nl-nav{padding:4px 6px!important;font-size:11px!important;letter-spacing:0!important;}
}
</style>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
<tr><td align="center">
<table role="presentation" class="nl-w" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
${ctx.personal ? personalBody : `${logo}\n${nav}\n${blockRows}\n${footer}`}
</table>
</td></tr>
</table>
</body>
</html>`;
}

// Plain-text alternative (multipart) — improves deliverability and is what
// text-only clients show.
export function renderNewsletterText(
  rawSettings: unknown,
  rawBlocks: unknown,
  opts: RenderOptions,
): string {
  const s = normalizeSettings(rawSettings);
  const href = (u: string) => withUtm(safeUrl(u), s.utmCampaign);
  const plain = (t: string) =>
    t
      .replace(
        /\[([^\]]+)\]\(([^)\s]+)\)/g,
        (_m, l: string, u: string) => `${l} (${href(u)})`,
      )
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1");
  const lines: string[] = [];
  for (const b of normalizeBlocks(rawBlocks)) {
    if (b.type === "heading") lines.push(b.text.toUpperCase(), "");
    if (b.type === "text") lines.push(plain(b.text), "");
    if (b.type === "button" && b.label)
      lines.push(`${b.label}: ${href(b.href)}`, "");
    if (b.type === "card") {
      if (b.title) lines.push(b.title.toUpperCase());
      if (b.text) lines.push(plain(b.text));
      if (b.href) lines.push(`${b.linkLabel || "Läs mer"}: ${href(b.href)}`);
      lines.push("");
    }
  }
  if (s.layout === "personal") {
    const sender = [s.footerAddress, s.footerEmail].filter(Boolean).join(" · ");
    lines.push("--");
    if (sender) lines.push(sender);
  } else {
    lines.push("--", s.footerAbout);
    if (s.footerEmail || s.footerPhone)
      lines.push([s.footerEmail, s.footerPhone].filter(Boolean).join(" | "));
    if (s.footerAddress) lines.push(s.footerAddress);
  }
  lines.push(
    "",
    `Avregistrera: ${opts.unsubscribeUrl || UNSUBSCRIBE_PLACEHOLDER}`,
  );
  return lines.join("\n");
}
