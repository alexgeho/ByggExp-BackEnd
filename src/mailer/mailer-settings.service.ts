import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import nodemailer, { Transporter } from "nodemailer";
import { decryptSecret, encryptSecret } from "./mailer-crypto";
import {
  MailerSettings,
  MailerSettingsDocument,
} from "./schemas/mailer.schemas";

export type MailerSettingsInput = Partial<{
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

// SMTP account for marketing mail. Deliberately separate from the
// transactional SMTP_* env (invoices, login codes) so a spam complaint on a
// campaign can never take down the product's own mail.
@Injectable()
export class MailerSettingsService {
  private cached: Transporter | null = null;
  private cachedKey = "";

  constructor(
    @InjectModel(MailerSettings.name)
    private readonly model: Model<MailerSettingsDocument>,
  ) {}

  async getDoc() {
    const doc = await this.model.findOne({ key: "main" });
    return doc ?? this.model.create({ key: "main" });
  }

  async getPublic() {
    const d = await this.getDoc();
    return {
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

  async update(input: MailerSettingsInput) {
    const d = await this.getDoc();
    const str = (v: unknown, max = 200) =>
      String(v ?? "")
        .trim()
        .slice(0, max);
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
    this.cached = null;
    return this.getPublic();
  }

  // Transport + envelope for a send. Throws a readable error when unset.
  async transport(): Promise<{
    transporter: Transporter;
    settings: MailerSettings;
    from: string;
  }> {
    const d = await this.getDoc();
    if (!this.isConfigured(d)) {
      throw new BadRequestException(
        "SMTP för utskick är inte inställt (Nyhetsbrev → Inställningar)",
      );
    }
    const cacheKey = `${d.smtpHost}|${d.smtpPort}|${d.smtpUser}|${d.smtpPassEnc}`;
    if (!this.cached || this.cachedKey !== cacheKey) {
      this.cached = nodemailer.createTransport({
        host: d.smtpHost,
        port: d.smtpPort,
        secure: d.smtpPort === 465,
        auth: { user: d.smtpUser, pass: decryptSecret(d.smtpPassEnc) },
        pool: true,
        maxConnections: 2,
      });
      this.cachedKey = cacheKey;
    }
    const name = d.fromName.replace(/["\r\n]/g, "");
    return {
      transporter: this.cached,
      settings: d,
      from: `"${name}" <${d.fromEmail}>`,
    };
  }

  async verifyConnection() {
    const { transporter } = await this.transport();
    try {
      await transporter.verify();
    } catch (err) {
      throw new BadRequestException(
        `SMTP-anslutningen misslyckades: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
