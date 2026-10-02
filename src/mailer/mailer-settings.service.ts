import { randomBytes } from "crypto";
import { promises as dns } from "dns";
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
  dailyCap,
  daysToTarget,
  inSendWindow,
  stockholmTime,
  warmupDay,
  warmupSchedule,
} from "./mailer-warmup";
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
  warmupEnabled: boolean;
  warmupRestart: boolean; // start the warm-up over from day 0
  warmupStartPerDay: number;
  warmupGrowthPct: number;
  warmupTargetPerDay: number;
  sendWindowEnabled: boolean;
  sendHourFrom: number;
  sendHourTo: number;
  weekdaysOnly: boolean;
  maxBounceRatePct: number;
}>;

// DKIM selectors to probe: DirectAdmin/Inleed use "x", others are common defaults.
const DKIM_SELECTORS = ["x", "default", "mail", "dkim", "selector1", "google"];

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
    // A new sender is usually a new domain: warm it up and keep to office hours.
    await this.model.create({
      key,
      label: name,
      fromName: name,
      ratePerHour: 30,
      warmupEnabled: true,
      warmupStartedAt: new Date(),
      sendWindowEnabled: true,
    });
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
      warmupEnabled: d.warmupEnabled,
      warmupStartedAt: d.warmupStartedAt,
      warmupStartPerDay: d.warmupStartPerDay,
      warmupGrowthPct: d.warmupGrowthPct,
      warmupTargetPerDay: d.warmupTargetPerDay,
      sendWindowEnabled: d.sendWindowEnabled,
      sendHourFrom: d.sendHourFrom,
      sendHourTo: d.sendHourTo,
      weekdaysOnly: d.weekdaysOnly,
      maxBounceRatePct: d.maxBounceRatePct,
      configured: this.isConfigured(d),
      status: this.status(d),
    };
  }

  // Live numbers for the admin: today's cap, sent today, schedule.
  status(d: MailerSettings, now = new Date()) {
    const cap = dailyCap(d, now);
    return {
      warmupDay: d.warmupEnabled ? warmupDay(d, now) + 1 : null,
      todayCap: cap,
      sentToday: this.sentToday(d, now),
      inWindow: inSendWindow(d, now),
      schedule: warmupSchedule(d, 28),
      daysToTarget: daysToTarget(d),
    };
  }

  sentToday(d: MailerSettings, now = new Date()) {
    return d.dailyDate === stockholmTime(now).date ? d.dailySent : 0;
  }

  // Count one sent mail against the sender's daily cap.
  async recordSent(key: string, now = new Date()) {
    const today = stockholmTime(now).date;
    const r = await this.model.updateOne(
      { key, dailyDate: today },
      { $inc: { dailySent: 1 } },
    );
    if (!r.matchedCount)
      await this.model.updateOne({ key }, { dailyDate: today, dailySent: 1 });
  }

  // SPF / DKIM / DMARC / MX of the sender domain, as the receiving side sees it.
  async dnsCheck(key = MAIN_SENDER) {
    const d = await this.getDoc(key);
    const domain = (d.fromEmail.split("@")[1] || "").trim();
    if (!domain) return { domain: "", checks: [] };
    const txt = async (name: string) => {
      try {
        return (await dns.resolveTxt(name)).map((r) => r.join(""));
      } catch {
        return [];
      }
    };
    let mx: string[] = [];
    try {
      mx = (await dns.resolveMx(domain)).map((r) => r.exchange);
    } catch {
      mx = [];
    }
    const spf = (await txt(domain)).find((v) => v.startsWith("v=spf1")) || "";
    const dmarc =
      (await txt(`_dmarc.${domain}`)).find((v) => v.startsWith("v=DMARC1")) ||
      "";
    let dkim = "";
    for (const sel of DKIM_SELECTORS) {
      const v = (await txt(`${sel}._domainkey.${domain}`)).find((x) =>
        x.includes("p="),
      );
      if (v) {
        dkim = `${sel}._domainkey: ${v.slice(0, 40)}…`;
        break;
      }
    }
    return {
      domain,
      checks: [
        { name: "MX", ok: mx.length > 0, value: mx.join(", ") },
        { name: "SPF", ok: Boolean(spf), value: spf },
        { name: "DKIM", ok: Boolean(dkim), value: dkim },
        { name: "DMARC", ok: Boolean(dmarc), value: dmarc },
      ],
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
    const int = (v: unknown, min: number, max: number, def: number) =>
      Math.min(max, Math.max(min, Math.round(Number(v)) || def));
    if (input.warmupEnabled !== undefined) {
      const on = Boolean(input.warmupEnabled);
      if (on && (!d.warmupEnabled || !d.warmupStartedAt))
        d.warmupStartedAt = new Date();
      d.warmupEnabled = on;
    }
    if (input.warmupRestart) d.warmupStartedAt = new Date();
    if (input.warmupStartPerDay !== undefined)
      d.warmupStartPerDay = int(input.warmupStartPerDay, 1, 1000, 20);
    if (input.warmupGrowthPct !== undefined)
      d.warmupGrowthPct = int(input.warmupGrowthPct, 1, 100, 25);
    if (input.warmupTargetPerDay !== undefined)
      d.warmupTargetPerDay = int(input.warmupTargetPerDay, 1, 20000, 300);
    if (input.sendWindowEnabled !== undefined)
      d.sendWindowEnabled = Boolean(input.sendWindowEnabled);
    if (input.sendHourFrom !== undefined)
      d.sendHourFrom = int(input.sendHourFrom, 0, 23, 8);
    if (input.sendHourTo !== undefined)
      d.sendHourTo = int(input.sendHourTo, 1, 24, 17);
    if (d.sendHourTo <= d.sendHourFrom) d.sendHourTo = d.sendHourFrom + 1;
    if (input.weekdaysOnly !== undefined)
      d.weekdaysOnly = Boolean(input.weekdaysOnly);
    if (input.maxBounceRatePct !== undefined)
      d.maxBounceRatePct = int(input.maxBounceRatePct, 1, 50, 5);
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
