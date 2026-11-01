import { BadRequestException } from "@nestjs/common";
import { UserRole } from "../users/schemas/user.schema";
import { InvoicesService } from "./invoices.service";

jest.mock("./puppeteer-launch", () => ({ launchForInvoicePdf: jest.fn() }));

// sendReminder: Swedish companies unchanged, Norwegian companies blocked before
// anything is e-mailed or saved.
function makeService(invoice: Record<string, unknown>, companyCountry = "SE") {
  const doc = { ...invoice, save: jest.fn().mockResolvedValue(undefined) };
  const invoiceModel = {
    findById: () => ({ exec: () => Promise.resolve(doc) }),
  };
  const companyModel = {
    findById: () => ({
      select: () => ({
        lean: () => ({
          exec: () => Promise.resolve({ country: companyCountry }),
        }),
      }),
      lean: () => ({
        exec: () => Promise.resolve({ country: companyCountry }),
      }),
    }),
    // Fair-use quota: the reservation always succeeds here.
    updateOne: () => Promise.resolve({ modifiedCount: 1 }),
  };
  const mail = {
    sendReminderEmail: jest.fn().mockResolvedValue({ sent: true, to: "k@x" }),
  };
  const svc = new InvoicesService(
    invoiceModel as never,
    companyModel as never,
    mail as never,
  );
  // PDF rendering needs Chrome — not under test here.
  jest.spyOn(svc, "buildInvoicePdf").mockResolvedValue(Buffer.from("x"));
  return { svc, mail, doc };
}

const user = { role: UserRole.CompanyAdmin, companyId: "c1", userId: "u1" };
const base = {
  companyId: "c1",
  email: "k@x",
  invoiceNumber: 5,
  total: 1000,
  roundedTotal: 1000,
  dueDate: "2026-01-01",
};

describe("payment reminders by country", () => {
  it("are refused for a Norwegian invoice and nothing is sent", async () => {
    const { svc, mail, doc } = makeService({ ...base, country: "NO" });
    await expect(svc.sendReminder("i1", user)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mail.sendReminderEmail).not.toHaveBeenCalled();
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("are refused for an older invoice of a Norwegian company (no snapshot)", async () => {
    const { svc, mail } = makeService({ ...base }, "NO");
    await expect(svc.sendReminder("i1", user)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mail.sendReminderEmail).not.toHaveBeenCalled();
  });

  it("still go out for a Swedish invoice", async () => {
    const { svc, mail } = makeService({ ...base, country: "SE" });
    const res = await svc.sendReminder("i1", user);
    expect(mail.sendReminderEmail).toHaveBeenCalledTimes(1);
    expect(res.reminderCount).toBe(1);
  });
});
