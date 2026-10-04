import { sanitizeSignupSource } from "./signup-source";

describe("sanitizeSignupSource", () => {
  it("keeps known fields, trims and caps them", () => {
    const s = sanitizeSignupSource(
      { utmSource: " brevo ", referrer: "x".repeat(500), evil: "drop" },
      "Mozilla/5.0",
    );
    expect(s.utmSource).toBe("brevo");
    expect(s.referrer).toHaveLength(300);
    expect((s as Record<string, unknown>).evil).toBeUndefined();
    expect(s.client).toBe("web");
  });

  it("marks requests without source from a non-browser as app", () => {
    expect(sanitizeSignupSource(undefined, "okhttp/4.9").client).toBe("app");
    expect(sanitizeSignupSource(undefined, "Mozilla/5.0").client).toBe("web");
  });

  it("ignores non-string values", () => {
    expect(sanitizeSignupSource({ utmSource: 5 }, "").utmSource).toBe("");
  });
});
