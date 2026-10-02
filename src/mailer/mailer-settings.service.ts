import { randomBytes } from "crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import nodemailer, { Transporter } from "nodemailer";
import { decryptSecret, encryptSecret } from "./mailer-crypto";
import {
  MailerSettings,
  MailerSettingsDocument,
} from "./schemas/mailer.schemas";

export type MailerSettingsInput = Partial<{
  label: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string; // plain; empty = keep the stored one
  fromName: string;
  fromEmail: string;
  replyTo: string;
  ratePerHour: number;
  trackOpens: boolean;
  trackClicks: boolean;
}>;

export const MAIN_SENDER = "main";

// SMTP accounts for marketing mail, one doc per sender profile ("main" =
// ByggExp; more can be added, e.g. a separate outreach domain). Deliberately
// separate from the transactional SMTP_* env (invoices, login codes) so a spam
// complaint on a campaign can never take down the product's own mail.
@Injectable()
export class MailerSettingsService {
  private cache = new Map<string, { key: string; transporter: Transporter }>();

  constructor(
    @InjectModel(MailerSettings.name)
    private readonly model: Model<MailerSettingsDocument>,
  ) {}

  async getDoc(key = MAIN_SENDER) {
    const doc = await this.model.findOne({ key });
    if (doc) return doc;
    if (key !== MAIN_SENDER)
      throw new NotFoundException("Avsändaren finns inte");
    return this.model.create({ key: MAIN_SENDER, label: "ByggExp" });
  }

  async exists(key: string) {
    return key === MAIN_SENDER || Boolean(await this.model.exists({ key }));
  }

  async listSenders() {
    await this.getDoc(MAIN_SENDER); // make sure the default profile exists
    const docs = await this.model.find({}).sort({ createdAt: 1 }).lean();
    return docs.map((d) => ({
      key: d.key,
      label: d.label || d.fromName || d.key,
      fromEmail: d.fromEmail,
      configured: this.isConfigured(d),
    }));
  }

  async createSender(label: string) {
    const name = String(label ?? "")
      .trim()
      .slice(0, 80);
    if (!name) throw new BadRequestException("Ange ett namn för avsändaren");
    const key = `s-${randomBytes(4).toString("hex")}`;
    await this.model.create({ key, label: name, fromName: name });
    return this.getPublic(key);
  }

  async removeSender(key: string) {
    if (key === MAIN_SENDER)
      throw new BadRequestException("Huvudavsändaren kan inte tas bort");
    await this.model.deleteOne({ key });
    this.cache.delete(key);
    return { deleted: true };
  }

  async getPublic(key = MAIN_SENDER) {
    const d = await this.getDoc(key);
    return {
      key: d.key,
      label: d.label || d.fromName || d.key,
      smtpHost: d.smtpHost,
      smtpPort: d.smtpPort,
      smtpUser: d.smtpUser,
      hasPassword: Boolean(d.smtpPassEnc),
      fromName: d.fromName,
      fromEmail: d.fromEmail,
      replyTo: d.replyTo,
      ratePerHour: d.ratePerHour,
      trackOpens: d.trackOpens,
      trackClicks: d.trackClicks,
      configured: this.isConfigured(d),
    };
  }

  isConfigured(d: MailerSettings) {
    return Boolean(d.smtpHost && d.smtpUser && d.smtpPassEnc && d.fromEmail);
  }

  async update(key: string, input: MailerSettingsInput) {
    const d = await this.getDoc(key);
    const str = (v: unknown, max = 200) =>
      String(v ?? "")
        .trim()
        .slice(0, max);
    if (input.label !== undefined) d.label = str(input.label, 80);
    if (input.smtpHost !== undefined) d.smtpHost = str(input.smtpHost);
    if (input.smtpPort !== undefined)
      d.smtpPort = Math.min(65535, Math.max(1, Number(input.smtpPort) || 587));
    if (input.smtpUser !== undefined) d.smtpUser = str(input.smtpUser);
    if (input.smtpPass) d.smtpPassEnc = encryptSecret(String(input.smtpPass));
    if (input.fromName !== undefined) d.fromName = str(input.fromName, 80);
    if (input.fromEmail !== undefined)
      d.fromEmail = str(input.fromEmail).toLowerCase();
    if (input.replyTo !== undefined)
      d.replyTo = str(input.replyTo).toLowerCase();
    if (input.ratePerHour !== undefined)
      d.ratePerHour = Math.min(
        3000,
        Math.max(10, Math.round(Number(input.ratePerHour) || 100)),
      );
    if (input.trackOpens !== undefined)
      d.trackOpens = Boolean(input.trackOpens);
    if (input.trackClicks !== undefined)
      d.trackClicks = Boolean(input.trackClicks);
    await d.save();
    this.cache.delete(d.key);
    return this.getPublic(d.key);
  }

  // Transport + envelope for a send. Throws a readable error when unset.
  async transport(key = MAIN_SENDER): Promise<{
    transporter: Transporter;
    settings: MailerSettings;
    from: string;
  }> {
    const d = await this.getDoc(key);
    if (!this.isConfigured(d)) {
      throw new BadRequestException(
        `SMTP för avsändaren "${d.label || d.key}" är inte inställt (Nyhetsbrev → Inställningar)`,
      );
    }
    const cacheKey = `${d.smtpHost}|${d.smtpPort}|${d.smtpUser}|${d.smtpPassEnc}`;
    let entry = this.cache.get(d.key);
    if (!entry || entry.key !== cacheKey) {
      const transporter = nodemailer.createTransport({
        host: d.smtpHost,
        port: d.smtpPort,
        secure: d.smtpPort === 465,
        auth: { user: d.smtpUser, pass: decryptSecret(d.smtpPassEnc) },
        pool: true,
        maxConnections: 2,
      });
      entry = { key: cacheKey, transporter };
      this.cache.set(d.key, entry);
    }
    const name = d.fromName.replace(/["\r\n]/g, "");
    return {
      transporter: entry.transporter,
      settings: d,
      from: `"${name}" <${d.fromEmail}>`,
    };
  }

  async verifyConnection(key = MAIN_SENDER) {
    const { transporter } = await this.transport(key);
    try {
      await transporter.verify();
    } catch (err) {
      throw new BadRequestException(
        `SMTP-anslutningen misslyckades: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
