import {
  asksToUnsubscribe,
  isAutoReply,
  isCompanyDomain,
  replySnippet,
} from "./mailer-funnel-parse";

describe("mailer funnel parsing", () => {
  it("keeps only the reply above the quote", () => {
    const text =
      "Nej tack, vi har redan Softone.\n\nMvh Anders\n\nDen 4 okt. 2026 kl. 10:12 skrev Alexander <a@b.se>:\n> Hej! Avregistrera";
    expect(replySnippet(text)).toBe(
      "Nej tack, vi har redan Softone. Mvh Anders",
    );
    expect(asksToUnsubscribe(replySnippet(text))).toBe(false);
  });

  it("stops at Outlook headers", () => {
    expect(
      replySnippet("Ring mig på måndag\nFrån: Alexander\nAvregistrera"),
    ).toBe("Ring mig på måndag");
  });

  it("detects unsubscribe requests", () => {
    expect(asksToUnsubscribe("Ta bort mig från er lista")).toBe(true);
    expect(asksToUnsubscribe("Unsubscribe")).toBe(true);
    expect(asksToUnsubscribe("Låter intressant")).toBe(false);
  });

  it("detects auto replies", () => {
    expect(isAutoReply("Automatiskt svar: Tidrapporter", {})).toBe(true);
    expect(
      isAutoReply("Re: Tidrapporter", { "auto-submitted": "auto-replied" }),
    ).toBe(true);
    expect(isAutoReply("Re: Tidrapporter", { "auto-submitted": "no" })).toBe(
      false,
    );
  });

  it("ignores free mailbox domains", () => {
    expect(isCompanyDomain("gmail.com")).toBe(false);
    expect(isCompanyDomain("sr-elteknik.se")).toBe(true);
  });
});

import { guessCategory } from "./mailer-funnel-parse";

describe("guessCategory", () => {
  it("sorts the usual replies", () => {
    expect(guessCategory("Nej tack")).toBe("no");
    expect(guessCategory("Vi använder Softone och är nöjda")).toBe(
      "has_system",
    );
    expect(guessCategory("Ring mig på måndag")).toBe("interest");
    expect(guessCategory("Inga anställda än, hör av mig senare")).toBe("later");
    expect(guessCategory("Hej")).toBe("");
  });
});
