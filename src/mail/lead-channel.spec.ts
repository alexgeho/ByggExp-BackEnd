import { leadChannel } from "./lead-channel";

describe("leadChannel", () => {
  it("prefers UTM tags", () => {
    expect(
      leadChannel({
        utmSource: "mailer",
        utmCampaign: "el-a",
        referrer: "https://www.google.com/",
        landing: "/sv",
      }),
    ).toBe("mailer / el-a → /sv");
  });

  it("falls back to the referrer host", () => {
    expect(
      leadChannel({
        referrer: "https://www.google.se/",
        landing: "/sv/tidrapport",
      }),
    ).toBe("google.se → /sv/tidrapport");
  });

  it("is direct with a landing page but no referrer", () => {
    expect(leadChannel({ landing: "/sv" })).toBe("direct → /sv");
  });

  it("is empty without visit data", () => {
    expect(leadChannel({})).toBe("");
  });
});
