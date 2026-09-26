import {
  inlineFormat,
  normalizeBlocks,
  renderNewsletterHtml,
  renderNewsletterText,
  safeUrl,
  UNSUBSCRIBE_PLACEHOLDER,
  withUtm,
} from "./newsletter-render";
import {
  defaultNewsletterTemplate,
  personalLetterTemplate,
} from "./newsletter-template";

describe("newsletter renderer", () => {
  it("renders the default template with every block and the footer", () => {
    const tpl = defaultNewsletterTemplate();
    const html = renderNewsletterHtml(tpl.settings, tpl.blocks, {
      subject: tpl.subject,
    });
    expect(html).toContain(
      "<title>Mer tid på bygget – mindre vid skrivbordet</title>",
    );
    expect(html).toContain("ByggExp från 499 kr/mån");
    expect(html).toContain(
      "https://admin.byggexp.se/newsletter-template/hero.jpg",
    );
    expect(html).toContain("Boka demo");
    expect(html).toContain(`href="${UNSUBSCRIBE_PLACEHOLDER}"`);
    expect(html).toContain("<b>gratis demo</b>");
  });

  it("escapes user text so it cannot inject markup", () => {
    const html = renderNewsletterHtml(
      {},
      [
        { type: "heading", text: "<script>alert(1)</script>", level: "h1" },
        { type: "text", text: 'a <img src=x onerror="x">' },
      ],
      { subject: "<b>x</b>" },
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<title>&lt;b&gt;x&lt;/b&gt;</title>");
  });

  it("neutralises dangerous URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("#");
    expect(safeUrl("data:text/html,x")).toBe("#");
    expect(safeUrl("https://byggexp.se")).toBe("https://byggexp.se");
    expect(safeUrl("mailto:a@b.se")).toBe("mailto:a@b.se");
    expect(safeUrl(UNSUBSCRIBE_PLACEHOLDER)).toBe(UNSUBSCRIBE_PLACEHOLDER);
  });

  it("adds UTM only to byggexp.se links without existing UTM", () => {
    expect(withUtm("https://byggexp.se/sv/contact#x", "sept")).toBe(
      "https://byggexp.se/sv/contact?utm_source=nyhetsbrev&utm_medium=email&utm_campaign=sept#x",
    );
    expect(withUtm("https://example.com/", "sept")).toBe(
      "https://example.com/",
    );
    expect(withUtm("https://byggexp.se/?utm_source=x", "sept")).toBe(
      "https://byggexp.se/?utm_source=x",
    );
    expect(withUtm("https://byggexp.se/", "")).toBe("https://byggexp.se/");
  });

  it("supports bold, italic, links and line breaks in text", () => {
    const out = inlineFormat(
      "**Fet** och *kursiv*\n[Boka](https://byggexp.se/sv/contact)",
      "#1c6cf3",
      "",
    );
    expect(out).toBe(
      '<b>Fet</b> och <i>kursiv</i><br><a href="https://byggexp.se/sv/contact" style="color:#1c6cf3;">Boka</a>',
    );
    expect(inlineFormat("[x](javascript:alert(1))", "#000000", "")).toContain(
      'href="#"',
    );
  });

  it("drops unknown block types and clamps values", () => {
    const blocks = normalizeBlocks([
      { type: "evil", html: "<script>" },
      { type: "spacer", height: 99999 },
      { type: "button", label: "Go", variant: "weird" },
    ]);
    expect(blocks.map((b) => b.type)).toEqual(["spacer", "button"]);
    expect(blocks[0]).toMatchObject({ height: 160 });
    expect(blocks[1]).toMatchObject({ variant: "filled" });
  });

  it("uses a real unsubscribe URL when given", () => {
    const html = renderNewsletterHtml({}, [], {
      subject: "s",
      unsubscribeUrl: "https://api.byggexp.se/u/abc",
    });
    expect(html).toContain('href="https://api.byggexp.se/u/abc"');
    expect(html).not.toContain(UNSUBSCRIBE_PLACEHOLDER);
  });

  it("produces a plain-text alternative", () => {
    const tpl = defaultNewsletterTemplate();
    const text = renderNewsletterText(tpl.settings, tpl.blocks, {
      subject: tpl.subject,
    });
    expect(text).toContain("BYGGEXP FRÅN 499 KR/MÅN");
    expect(text).toContain(
      "Boka demo: https://byggexp.se/sv/contact?utm_source=nyhetsbrev",
    );
    expect(text).toContain(`Avregistrera: ${UNSUBSCRIBE_PLACEHOLDER}`);
  });

  it("renders the personal letter without logo, menu or images", () => {
    const tpl = personalLetterTemplate();
    const html = renderNewsletterHtml(tpl.settings, tpl.blocks, {
      subject: tpl.subject,
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain(`class="nl-nav"`);
    expect(html).toContain('align="left"');
    expect(html).toContain("Med vänliga hälsningar,<br>Alexander Gerhard");
    expect(html).toContain("Avregistrera");
    expect(html).toContain(UNSUBSCRIBE_PLACEHOLDER);
    const text = renderNewsletterText(tpl.settings, tpl.blocks, {
      subject: tpl.subject,
    });
    expect(text).not.toContain(tpl.settings.footerAbout);
    expect(text).toContain(`Avregistrera: ${UNSUBSCRIBE_PLACEHOLDER}`);
  });
});
