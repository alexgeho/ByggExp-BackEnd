import type { Model } from "mongoose";

// Reply-To for mails a company sends to its customers (offer, invoice,
// reminder): the e-mail the company was registered with — the login of its
// first admin — so the customer's reply reaches the company, not our noreply.
// Falls back to the company's own e-mail. Never blocks sending: on any lookup
// error the mail simply goes without Reply-To.
export async function companyReplyTo(
  companyModel: Model<any>,
  companyId: string,
): Promise<string | undefined> {
  try {
    const firstAdmin = await companyModel.db
      .model("User")
      .findOne({ companyId: String(companyId), role: "companyAdmin" })
      .sort({ createdAt: 1 })
      .select("email")
      .lean<{ email?: string }>()
      .exec();
    let email = firstAdmin?.email || "";
    if (!email) {
      const company = await companyModel
        .findById(companyId)
        .select("email")
        .lean<{ email?: string }>()
        .exec();
      email = company?.email || "";
    }
    email = email.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
  } catch {
    return undefined;
  }
}
