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

import { htmlToText } from "./mailer-funnel-parse";

describe("reply text", () => {
  it("cuts English Gmail quotes", () => {
    expect(
      replySnippet(
        "Tack men vi sköter det själva\nOn Sun, Oct 4, 2026 at 4:17 PM Alexander <a@b.se>\nwrote:",
      ),
    ).toBe("Tack men vi sköter det själva");
  });
  it("reads HTML-only mails", () => {
    expect(
      replySnippet(
        htmlToText(
          "<div>Vi kör Softone<br>Mvh</div><blockquote>Hej</blockquote>",
        ),
      ),
    ).toBe("Vi kör Softone Mvh");
  });
});

describe("leads waiting for an answer", () => {
  const { isBulk, waitingLeads } = jest.requireActual("./mailer-funnel-parse");

  it("treats newsletters as bulk", () => {
    expect(isBulk({ "list-unsubscribe": "<mailto:x>" })).toBe(true);
    expect(isBulk({ precedence: "bulk" })).toBe(true);
    expect(isBulk({})).toBe(false);
  });

  it("keeps one row per sender: the latest, if unanswered and relevant", () => {
    const rows = waitingLeads([
      {
        email: "a@x.se",
        receivedAt: "2026-10-20",
        answered: true,
        category: "interest",
      },
      {
        email: "a@x.se",
        receivedAt: "2026-10-22",
        answered: false,
        category: "interest",
      },
      {
        email: "b@y.se",
        receivedAt: "2026-10-21",
        answered: false,
        category: "",
      },
      {
        email: "c@z.se",
        receivedAt: "2026-10-19",
        answered: false,
        category: "no",
      },
      {
        email: "d@w.se",
        receivedAt: "2026-10-18",
        answered: false,
        category: "interest",
      },
      {
        email: "d@w.se",
        receivedAt: "2026-10-23",
        answered: true,
        category: "interest",
      },
    ]);
    expect(rows.map((r: { email: string }) => r.email)).toEqual([
      "b@y.se",
      "a@x.se",
    ]);
  });
});

describe("lead stage", () => {
  const { leadStage, waitingLeads } = jest.requireActual(
    "./mailer-funnel-parse",
  );
  const m = (x: object) => ({
    email: "a@x.se",
    receivedAt: "2026-10-01",
    category: "interest",
    ...x,
  });

  it("derives replied / answered / lost, a manual stage wins", () => {
    expect(leadStage(m({}))).toBe("replied");
    expect(leadStage(m({ answered: true }))).toBe("answered");
    expect(leadStage(m({ category: "no" }))).toBe("lost");
    expect(leadStage(m({ category: "no", stage: "offer" }))).toBe("offer");
    expect(leadStage(m({ stage: "bogus" }))).toBe("replied");
  });

  it("a lead with a stage set by hand no longer waits", () => {
    expect(waitingLeads([m({ stage: "meeting" })])).toEqual([]);
  });
});
