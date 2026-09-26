process.env.JWT_SECRET = process.env.JWT_SECRET || "test_secret";

import {
  decryptSecret,
  encryptSecret,
  signLink,
  verifyLink,
} from "./mailer-crypto";
import {
  addTracking,
  applyMergeTags,
  isValidEmailSyntax,
  normalizeEmail,
  unsubscribeUrlFor,
} from "./mailer-personalize";

const API = "https://api.byggexp.se";
const TOKEN = "a".repeat(32);

describe("mailer merge tags", () => {
  const r = {
    email: "lars@ekomiljo.se",
    name: "Lars",
    company: "Ekomiljö <AB>",
  };

  it("fills name/company/email and escapes for HTML", () => {
    expect(applyMergeTags("Hej {{namn}} på {{företag}}!", r, true)).toBe(
      "Hej Lars på Ekomiljö &lt;AB&gt;!",
    );
    expect(applyMergeTags("{{email}}", r, false)).toBe("lars@ekomiljo.se");
  });

  it("uses the fallback when the field is empty and keeps unknown tags", () => {
    expect(applyMergeTags("Hej {{namn|där}}", { ...r, name: "" }, false)).toBe(
      "Hej där",
    );
    expect(applyMergeTags("{{unsubscribe_url}}", r, false)).toBe(
      "{{unsubscribe_url}}",
    );
  });
});

describe("mailer tracking", () => {
  const unsub = unsubscribeUrlFor(API, TOKEN);
  const html = `<html><body><a href="https://byggexp.se/sv?a=1&amp;b=2">x</a><a href="${unsub}">u</a><a href="mailto:x@y.se">m</a></body></html>`;

  it("wraps http links with a signed redirect but never the unsubscribe link", () => {
    const out = addTracking(html, {
      apiBase: API,
      token: TOKEN,
      trackClicks: true,
      trackOpens: false,
    });
    const m = out.match(/href="([^"]+)"/g) ?? [];
    expect(m[0]).toContain(
      `${API}/m/c/${TOKEN}?u=${encodeURIComponent("https://byggexp.se/sv?a=1&b=2")}`,
    );
    expect(out).toContain(`href="${unsub}"`);
    expect(out).toContain('href="mailto:x@y.se"');
    const sig = decodeURIComponent(
      (m[0] ?? "").split("&amp;s=")[1].replace(/"$/, ""),
    );
    expect(verifyLink(TOKEN, "https://byggexp.se/sv?a=1&b=2", sig)).toBe(true);
  });

  it("adds an open pixel before </body>", () => {
    const out = addTracking(html, {
      apiBase: API,
      token: TOKEN,
      trackClicks: false,
      trackOpens: true,
    });
    expect(out).toMatch(new RegExp(`/m/o/${TOKEN}\\.gif"[^>]*>\\n</body>`));
  });
});

describe("mailer crypto", () => {
  it("round-trips the SMTP password and never stores it in clear", () => {
    const enc = encryptSecret("hemligt-lösen");
    expect(enc).not.toContain("hemligt");
    expect(decryptSecret(enc)).toBe("hemligt-lösen");
    expect(encryptSecret("")).toBe("");
  });

  it("rejects tampered click links", () => {
    const sig = signLink(TOKEN, "https://byggexp.se/");
    expect(verifyLink(TOKEN, "https://byggexp.se/", sig)).toBe(true);
    expect(verifyLink(TOKEN, "https://evil.example/", sig)).toBe(false);
    expect(verifyLink("b".repeat(32), "https://byggexp.se/", sig)).toBe(false);
    expect(verifyLink(TOKEN, "https://byggexp.se/", "")).toBe(false);
  });
});

describe("mailer address checks", () => {
  it("normalises and validates addresses", () => {
    expect(normalizeEmail("  Info@FahlensBygg.se ")).toBe(
      "info@fahlensbygg.se",
    );
    expect(normalizeEmail("mailto:a@b.se")).toBe("a@b.se");
    expect(isValidEmailSyntax("info@nvbs.se")).toBe(true);
    expect(isValidEmailSyntax("victor.olsson@tjuren.nu")).toBe(true);
    expect(isValidEmailSyntax("nope")).toBe(false);
    expect(isValidEmailSyntax("a@b")).toBe(false);
    expect(isValidEmailSyntax("a b@c.se")).toBe(false);
  });
});
