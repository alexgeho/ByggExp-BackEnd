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

  it("an auto-reply after a real mail does not hide it", () => {
    const rows = waitingLeads([
      m({ receivedAt: "2026-10-28T10:00", category: "interest" }),
      m({ receivedAt: "2026-10-28T10:01", category: "auto" }),
    ]);
    expect(rows.map((r: { category: string }) => r.category)).toEqual([
      "interest",
    ]);
  });
});

describe("leadList", () => {
  const { leadList } = jest.requireActual("./mailer-funnel-parse");
  const m = (o: Record<string, unknown>) => ({
    email: "a@x.se",
    receivedAt: "2026-10-20T10:00",
    category: "",
    ...o,
  });

  it("whose turn: unanswered = us first, answered = them", () => {
    const rows = leadList([
      m({ email: "a@x.se", answered: true, receivedAt: "2026-10-29" }),
      m({ email: "b@x.se", receivedAt: "2026-10-30" }),
      m({ email: "c@x.se", receivedAt: "2026-10-19" }),
      m({ email: "d@x.se", category: "no" }),
      m({ email: "e@x.se", stage: "won" }),
      m({ email: "f@x.se", category: "auto" }),
    ]);
    expect(
      rows.map((r: { email: string; turn: string }) => `${r.email}:${r.turn}`),
    ).toEqual(["c@x.se:us", "b@x.se:us", "a@x.se:them"]);
  });
});

describe("formLead", () => {
  const { formLead, leadKey } = jest.requireActual("./mailer-funnel-parse");
  it("takes Reply-To, then e-mail, then phone; drops tests", () => {
    expect(
      formLead("Namn/företag: Kenth\nKontakt: 0707931202", "", "x.se"),
    ).toEqual({ email: "tel 0707931202", name: "Kenth" });
    expect(
      formLead(
        "Namn/företag: K\nKontakt: 0761288880/karolina.moe@gmail.com",
        "",
        "x.se",
      ),
    ).toEqual({ email: "karolina.moe@gmail.com", name: "K" });
    expect(
      formLead("Namn/företag: S AB\nE-post: a@b.se", "jj@s.com", "x.se")?.email,
    ).toBe("jj@s.com");
    expect(
      formLead(
        "Namn: Test\nTelefon: 070\nE-post: test@example.com",
        "",
        "x.se",
      ),
    ).toBeNull();
    expect(
      formLead("Namn/företag: TEST Claude – diagnostik", "", "x.se"),
    ).toBeNull();
    expect(leadKey("tel 0729-958330")).toBe(leadKey("Tel 0729958330"));
  });
});
