import { isMobileUserAgent, resetSuccessHtml } from "./auth.controller";

const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("password reset success page", () => {
  it("tells phones from computers", () => {
    expect(isMobileUserAgent(IPHONE)).toBe(true);
    expect(isMobileUserAgent("Mozilla/5.0 (Linux; Android 14)")).toBe(true);
    expect(isMobileUserAgent(MAC)).toBe(false);
    expect(isMobileUserAgent(undefined)).toBe(false);
  });

  it("on a computer leads with signing in on the web, not the app", () => {
    const html = resetSuccessHtml("companyAdmin", "ru", false);
    expect(html).toMatch(/<div id="mobile" style="display:none;">/);
    expect(html).toMatch(/<div id="desktop">/);
    expect(html).toContain("Войти в ByggExp");
    expect(html).toContain('href="https://admin.byggexp.se/login"');
  });

  it("on a phone leads with opening the app", () => {
    const html = resetSuccessHtml("worker", "sv", true);
    expect(html).toMatch(/<div id="mobile">/);
    expect(html).toMatch(/<div id="desktop" style="display:none;">/);
    expect(html).toContain("Öppna appen");
  });
});
