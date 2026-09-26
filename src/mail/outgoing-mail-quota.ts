import { HttpException, HttpStatus } from "@nestjs/common";
import { Model } from "mongoose";
import { CompanyDocument } from "../company/schemas/company.schema";

// Fair use: e-mails a company can send to its customers per day (invoices,
// payment reminders and offers together). Protects our mail server's
// reputation — above it the company contacts us and we agree on more.
export const OUTGOING_EMAILS_PER_DAY = 20;

const stockholmDay = (date = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(
    date,
  );

// Reserves one send for the company today, or throws 429 when the daily limit
// is used up. Atomic: the counter is only bumped while it is under the limit.
export async function reserveOutgoingEmail(
  companyModel: Model<CompanyDocument>,
  companyId: string,
): Promise<void> {
  const day = stockholmDay();
  const sameDay = await companyModel.updateOne(
    {
      _id: companyId,
      "outgoingMail.day": day,
      "outgoingMail.count": { $lt: OUTGOING_EMAILS_PER_DAY },
    },
    { $inc: { "outgoingMail.count": 1 } },
  );
  if (sameDay.modifiedCount) return;

  const newDay = await companyModel.updateOne(
    { _id: companyId, "outgoingMail.day": { $ne: day } },
    { $set: { outgoingMail: { day, count: 1 } } },
  );
  if (newDay.modifiedCount) return;

  throw new HttpException(
    `Dagens gräns för utskick är nådd (${OUTGOING_EMAILS_PER_DAY} e-post per dag). ` +
      "Kontakta ByggExp om ni behöver skicka fler.",
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
