import { ConfigService } from "@nestjs/config";
import { MailService } from "./mail.service";

type Sent = {
  subject: string;
  text: string;
  html: string;
  attachments: { filename: string }[];
};

function makeService() {
  const config = { get: () => undefined } as unknown as ConfigService;
  const svc = new MailService(config);
  const sendMail = jest
    .fn<Promise<void>, [Sent]>()
    .mockResolvedValue(undefined);
  (svc as unknown as { transporter: unknown }).transporter = { sendMail };
  return { svc, sendMail };
}

const pdf = Buffer.from("x");

describe("invoice / quote cover e-mails", () => {
  it("Swedish invoice e-mail is unchanged", async () => {
    const { svc, sendMail } = makeService();
    await svc.sendInvoiceEmail("a@b.se", {
      invoiceNumber: 39,
      senderName: "Geal AB",
      dueDate: "2026-09-12",
      pdf,
    });
    expect(sendMail.mock.calls[0][0]).toMatchSnapshot();
  });

  it("Swedish offer e-mail is unchanged", async () => {
    const { svc, sendMail } = makeService();
    await svc.sendOfferEmail("a@b.se", {
      offerNumber: 7,
      senderName: "Geal AB",
      validUntil: "2026-09-12",
      pdf,
    });
    expect(sendMail.mock.calls[0][0]).toMatchSnapshot();
  });

  it("Norwegian invoice e-mail is in bokmål with dd.mm.yyyy", async () => {
    const { svc, sendMail } = makeService();
    await svc.sendInvoiceEmail("a@b.no", {
      invoiceNumber: 12,
      senderName: "Fjord Bygg AS",
      dueDate: "2026-09-12",
      pdf,
      lang: "nb",
    });
    const m = sendMail.mock.calls[0][0];
    expect(m.subject).toBe("Faktura 12 — Fjord Bygg AS");
    expect(m.text).toContain("Vedlagt finner du faktura 12 fra Fjord Bygg AS.");
    expect(m.text).toContain("Forfallsdato: 12.09.2026.");
    expect(m.text).toContain("Med vennlig hilsen");
    expect(m.attachments[0].filename).toBe("faktura-12.pdf");
  });

  it("Norwegian quote e-mail", async () => {
    const { svc, sendMail } = makeService();
    await svc.sendOfferEmail("a@b.no", {
      offerNumber: 5,
      senderName: "Fjord Bygg AS",
      validUntil: "2026-09-30",
      pdf,
      lang: "nb",
    });
    const m = sendMail.mock.calls[0][0];
    expect(m.subject).toBe("Tilbud 5 — Fjord Bygg AS");
    expect(m.text).toContain("Vedlagt finner du tilbud 5 fra Fjord Bygg AS.");
    expect(m.text).toContain("Gyldig til: 30.09.2026.");
    expect(m.attachments[0].filename).toBe("tilbud-5.pdf");
  });
});
