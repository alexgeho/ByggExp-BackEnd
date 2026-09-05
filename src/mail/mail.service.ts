import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { Transporter } from "nodemailer";
import { existsSync } from "fs";
import { join } from "path";
import {
  MailLang,
  MAIL_LANGS,
  GREETING_FALLBACK,
  inviteCopy,
  resetCopy,
  loginCodeCopy,
} from "./email-copy";

type DemoRequestPayload = {
  name: string;
  email: string;
  phone: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>("SMTP_HOST");
    const port = Number(this.configService.get<string>("SMTP_PORT") || 587);
    const user = this.configService.get<string>("SMTP_USER");
    const pass = this.configService.get<string>("SMTP_PASS");

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    } else {
      this.logger.warn(
        "SMTP is not configured. Worker verification emails will be logged only.",
      );
    }
  }

  // Whether SMTP is wired up (used by the system-status panel).
  isConfigured(): boolean {
    return this.transporter !== null;
  }

  // Send a one-off diagnostic email so an admin can confirm SMTP works right
  // after setting the secrets. Throws if not configured or the send fails.
  async sendTestEmail(to: string): Promise<void> {
    if (!this.transporter) {
      throw new Error("SMTP is not configured");
    }
    await this.transporter.sendMail({
      from: this.getFromAddress(),
      to,
      subject: "ByggExp — test email",
      text: "This is a test email from ByggExp. SMTP is working correctly.",
      html: "<p>This is a test email from <strong>ByggExp</strong>. SMTP is working correctly.</p>",
    });
  }

  private getFromAddress(): string {
    const address =
      this.configService.get<string>("SMTP_FROM") ||
      this.configService.get<string>("SMTP_USER") ||
      "noreply@byggexp.se";
    // Show a friendly sender name ("ByggExp") unless one is already provided.
    if (address.includes("<") || address.includes('"')) {
      return address;
    }
    return `"ByggExp" <${address}>`;
  }

  private getApiPublicUrl(): string {
    const configured =
      this.configService.get<string>("API_PUBLIC_URL") ||
      this.configService.get<string>("APP_PUBLIC_URL");

    if (configured) {
      return configured.replace(/\/$/, "");
    }

    const port = this.configService.get<string>("PORT") || "3000";
    return `http://localhost:${port}`;
  }

  // Public URL of the admin web app (where the invite acceptance page lives).
  private getWebAppUrl(): string {
    const configured =
      this.configService.get<string>("WEB_APP_URL") ||
      this.configService.get<string>("ADMIN_APP_URL");
    if (configured) {
      return configured.replace(/\/$/, "");
    }
    return "http://localhost:5173";
  }

  // The BYGGEXP logo, embedded as a CID attachment so it renders inline in every
  // email client (base64/data: URIs get stripped by Gmail/Outlook). Returns null
  // if the asset is missing so sends still work.
  private logoAttachment(): {
    filename: string;
    path: string;
    cid: string;
  } | null {
    const logoPath = join(process.cwd(), "assets", "email-logo.png");
    if (!existsSync(logoPath)) {
      return null;
    }
    return { filename: "byggexp-logo.png", path: logoPath, cid: "byggexplogo" };
  }

  // Wrap an email body in a branded shell: centered logo header on a light card.
  private brandedHtml(innerHtml: string): string {
    const hasLogo = this.logoAttachment() !== null;
    const logo = hasLogo
      ? `<img src="cid:byggexplogo" alt="ByggExp" width="150" style="width:150px;max-width:150px;height:auto;display:inline-block;" />`
      : `<span style="font-size:22px;font-weight:800;letter-spacing:1px;color:#052d50;">BYGGEXP</span>`;
    return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#eef4fb;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef4fb;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;">
          <tr><td align="center" style="padding:28px 24px 8px;">${logo}</td></tr>
          <tr><td style="padding:8px 32px 32px;font-family:Arial,Helvetica,sans-serif;color:#052d50;font-size:15px;line-height:1.55;">
            ${innerHtml}
          </td></tr>
        </table>
        <div style="max-width:480px;padding:16px;font-family:Arial,Helvetica,sans-serif;color:#8a97a8;font-size:12px;text-align:center;">© ByggExp</div>
      </td></tr>
    </table>
  </body>
</html>`;
  }

  // Attachments array carrying the inline logo (empty if the asset is missing).
  private brandedAttachments(): Array<{
    filename: string;
    path: string;
    cid: string;
  }> {
    const logo = this.logoAttachment();
    return logo ? [logo] : [];
  }

  // Invite the recipient to set up a company's admin account. No password —
  // they create their own on the acceptance page; no User exists until then.
  async sendCompanyInviteEmail(
    email: string,
    companyName: string,
    token: string,
    lang: string = "sv",
  ): Promise<void> {
    const acceptUrl = `${this.getWebAppUrl()}/invite?token=${encodeURIComponent(token)}`;
    const fallback = {
      sv: "ditt företag",
      nb: "bedriften din",
      en: "your company",
    };
    const l = this.resolveMailLang(lang);
    const name = this.escapeHtml(companyName || fallback[l]);
    const plainName = companyName || fallback[l];
    const copy = {
      sv: {
        subject: "Du är inbjuden till ByggExp",
        intro: `Du har blivit inbjuden att sätta upp ${plainName} på ByggExp.`,
        introHtml: `Du har blivit inbjuden att sätta upp <strong>${name}</strong> på <strong>ByggExp</strong>.`,
        open: "Öppna länken nedan för att skapa ditt administratörskonto (namn + lösenord):",
        link: "Acceptera inbjudan och skapa konto",
        expires: "Denna inbjudan går ut om 7 dagar.",
      },
      nb: {
        subject: "Du er invitert til ByggExp",
        intro: `Du har blitt invitert til å sette opp ${plainName} på ByggExp.`,
        introHtml: `Du har blitt invitert til å sette opp <strong>${name}</strong> på <strong>ByggExp</strong>.`,
        open: "Åpne lenken nedenfor for å opprette administratorkontoen din (navn + passord):",
        link: "Godta invitasjon og opprett konto",
        expires: "Denne invitasjonen utløper om 7 dager.",
      },
      en: {
        subject: "You are invited to ByggExp",
        intro: `You have been invited to set up ${plainName} on ByggExp.`,
        introHtml: `You have been invited to set up <strong>${name}</strong> on <strong>ByggExp</strong>.`,
        open: "Open the link below to create your admin account (name + password):",
        link: "Accept invitation and create account",
        expires: "This invitation expires in 7 days.",
      },
    }[l];
    const subject = copy.subject;
    const text = [copy.intro, "", copy.open, acceptUrl, "", copy.expires].join(
      "\n",
    );
    const html = `
      <p>${copy.introHtml}</p>
      <p>${copy.open}</p>
      <p><a href="${acceptUrl}">${copy.link}</a></p>
      <p>${copy.expires}</p>
    `;

    if (!this.transporter) {
      this.logger.log(
        `Company invite for ${email} (${companyName}): ${acceptUrl}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.getFromAddress(),
      to: email,
      subject,
      text,
      html,
    });
  }

  private getDemoRequestRecipients(): string[] {
    return (
      this.configService.get<string>("DEMO_REQUEST_RECIPIENTS") ||
      this.configService.get<string>("DEMO_REQUEST_RECIPIENT") ||
      "870717ag@gmail.com"
    )
      .split(",")
      .map((recipient) => recipient.trim())
      .filter(Boolean);
  }

  // Normalise a language/country hint to a supported mail language. Accepts a
  // language code ("sv"/"nb"/"en") or an ISO country code ("SE"/"NO"); anything
  // unknown falls back to Swedish, the product's home market.
  private resolveMailLang(hint?: string): MailLang {
    const h = (hint || "").toLowerCase();
    if (h === "no" || h === "nn") return "nb"; // mobile uses "no", mail uses "nb"
    if (h === "gb" || h === "us") return "en";
    return (MAIL_LANGS as string[]).includes(h) ? (h as MailLang) : "sv";
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async sendUserInviteEmail(
    email: string,
    name: string,
    token: string,
    roleLabel: string,
    lang: string = "sv",
  ): Promise<void> {
    const verificationUrl = `${this.getApiPublicUrl()}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const l = this.resolveMailLang(lang);
    const copy = inviteCopy[l]({ name, roleLabel });
    const subject = copy.subject;
    const text = [
      copy.hi,
      "",
      copy.invited,
      "",
      copy.open,
      verificationUrl,
      "",
      copy.later,
      copy.expires,
    ].join("\n");

    const html = `
      <p>${copy.hi}</p>
      <p>${copy.invited}</p>
      <p>${copy.open}</p>
      <p><a href="${verificationUrl}">${copy.link}</a></p>
      <p>${copy.later}</p>
      <p>${copy.expires}</p>
    `;

    if (!this.transporter) {
      this.logger.log(
        `User invite email for ${email} (${roleLabel}): ${verificationUrl}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.getFromAddress(),
      to: email,
      subject,
      text,
      html,
    });
  }

  // Sent right after a company self-registers from the mobile app. Delivers
  // both access paths: a 6-digit code to sign in on the app, and a one-click
  // link into the web admin panel. Also states the trial terms.
  async sendCompanyWelcomeEmail(opts: {
    email: string;
    name: string;
    companyName: string;
    trialDays: number;
    maxUsers: number;
  }): Promise<void> {
    const adminLink = this.getWebAppUrl();
    const name = this.escapeHtml(opts.name || "there");
    const companyName = this.escapeHtml(opts.companyName || "your company");
    const subject = "Welcome to ByggExp — your trial is ready";
    const text = [
      `Hi ${opts.name || "there"},`,
      "",
      `Your company ${opts.companyName || ""} is set up on ByggExp and your ${opts.trialDays}-day free trial has started (up to ${opts.maxUsers} users).`,
      "",
      "Sign in on the mobile app and the web admin panel with your email and the password you chose.",
      "",
      `Open the web admin panel here: ${adminLink}`,
      "",
      "Welcome aboard!",
    ].join("\n");
    const html = this.brandedHtml(`
      <p style="margin:0 0 12px;">Hi ${name},</p>
      <p style="margin:0 0 12px;">Your company <strong>${companyName}</strong> is set up on <strong>ByggExp</strong> and your <strong>${opts.trialDays}-day free trial</strong> has started (up to <strong>${opts.maxUsers} users</strong>).</p>
      <p style="margin:0 0 20px;">Sign in on the mobile app and the web admin panel with your email and the password you chose at sign-up.</p>
      <p style="margin:0 0 20px;"><a href="${adminLink}" style="display:inline-block;background:#3183ff;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:24px;font-weight:600;">Sign in to the admin panel</a></p>
      <p style="margin:0;">Welcome aboard!</p>
    `);

    if (!this.transporter) {
      this.logger.log(`Company welcome for ${opts.email}: admin=${adminLink}`);
      return;
    }

    await this.transporter.sendMail({
      from: this.getFromAddress(),
      to: opts.email,
      subject,
      text,
      html,
      attachments: this.brandedAttachments(),
    });
  }

  // Sent at sign-up step 1: a link the user clicks to confirm their email. The
  // account is created only when the link is opened, and the app signs them in
  // automatically via the deep link (same mechanism as worker invites).
  async sendCompanyVerificationEmail(
    email: string,
    name: string,
    token: string,
  ): Promise<void> {
    const confirmUrl = `${this.getApiPublicUrl()}/auth/register-company/confirm?token=${encodeURIComponent(token)}`;
    const safeName = this.escapeHtml(name || "there");
    const subject =
      "Confirm your email to finish creating your ByggExp account";
    const text = [
      `Hi ${name || "there"},`,
      "",
      "Open the link below to confirm your email and finish creating your ByggExp account — you'll be signed in automatically:",
      confirmUrl,
      "",
      "This link expires in 24 hours. If you didn't request this, you can ignore this email.",
    ].join("\n");
    const html = this.brandedHtml(`
      <p style="margin:0 0 12px;">Hi ${safeName},</p>
      <p style="margin:0 0 20px;">Open the link below to confirm your email and finish creating your ByggExp account — you'll be signed in automatically:</p>
      <p style="margin:0 0 20px;"><a href="${confirmUrl}" style="display:inline-block;background:#3183ff;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:24px;font-weight:600;">Confirm email and create account</a></p>
      <p style="color:#5a6b7d;font-size:13px;margin:0;">This link expires in 24 hours. If you didn't request this, you can ignore this email.</p>
    `);

    if (!this.transporter) {
      this.logger.log(`Registration confirm for ${email}: ${confirmUrl}`);
      return;
    }

    await this.transporter.sendMail({
      from: this.getFromAddress(),
      to: email,
      subject,
      text,
      html,
      attachments: this.brandedAttachments(),
    });
  }

  // A "reset your password" link. Opens a web page where the user picks a new
  // password (works for both the admin panel and the app — they then sign in
  // with email + the new password).
  async sendPasswordResetEmail(
    email: string,
    name: string,
    token: string,
    lang: string = "sv",
  ): Promise<void> {
    const resetUrl = `${this.getApiPublicUrl()}/auth/reset-password?token=${encodeURIComponent(token)}`;
    const l = this.resolveMailLang(lang);
    const greetName = name || GREETING_FALLBACK[l];
    const copy = resetCopy[l]({ name: greetName });
    const subject = copy.subject;
    const text = [copy.hi, "", copy.intro, resetUrl, "", copy.expires].join(
      "\n",
    );
    const html = this.brandedHtml(`
      <p style="margin:0 0 12px;">${this.escapeHtml(copy.hi)}</p>
      <p style="margin:0 0 20px;">${copy.intro}</p>
      <p style="margin:0 0 20px;"><a href="${resetUrl}" style="display:inline-block;background:#3183ff;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:24px;font-weight:600;">${copy.button}</a></p>
      <p style="color:#5a6b7d;font-size:13px;margin:0;">${copy.expires}</p>
    `);

    if (!this.transporter) {
      this.logger.log(`Password reset for ${email}: ${resetUrl}`);
      return;
    }

    await this.transporter.sendMail({
      from: this.getFromAddress(),
      to: email,
      subject,
      text,
      html,
      attachments: this.brandedAttachments(),
    });
  }

  // A fresh 6-digit sign-in code for app re-login (requested from the app).
  async sendLoginCodeEmail(
    email: string,
    name: string,
    code: string,
    lang: string = "sv",
  ): Promise<void> {
    const l = this.resolveMailLang(lang);
    const greetName = name || GREETING_FALLBACK[l];
    const copy = loginCodeCopy[l]({ name: greetName });
    const subject = copy.subject;
    const text = [
      copy.hi,
      "",
      `${copy.intro} ${code}`,
      copy.expires,
    ].join("\n");
    const html = this.brandedHtml(`
      <p style="margin:0 0 8px;">${this.escapeHtml(copy.hi)}</p>
      <p style="margin:0 0 8px;">${copy.intro}</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:8px 0 16px;color:#052d50;">${this.escapeHtml(code)}</p>
      <p style="color:#5a6b7d;font-size:13px;margin:0;">${copy.expires}</p>
    `);

    if (!this.transporter) {
      this.logger.log(`Login code for ${email}: ${code}`);
      return;
    }

    await this.transporter.sendMail({
      from: this.getFromAddress(),
      to: email,
      subject,
      text,
      html,
      attachments: this.brandedAttachments(),
    });
  }

  async sendInvoiceEmail(
    to: string,
    opts: {
      invoiceNumber: string | number;
      senderName?: string;
      dueDate?: string;
      message?: string;
      pdf: Buffer;
    },
  ): Promise<{ sent: boolean; to: string }> {
    const nr = String(opts.invoiceNumber);
    const subject = `Faktura ${nr}${opts.senderName ? ` — ${opts.senderName}` : ""}`;
    const text = [
      "Hej,",
      "",
      `Bifogat finner du faktura ${nr}${opts.senderName ? ` från ${opts.senderName}` : ""}.`,
      opts.dueDate ? `Förfallodatum: ${opts.dueDate}.` : "",
      opts.message || "",
      "",
      "Med vänliga hälsningar",
      opts.senderName || "",
    ]
      .filter((line, i, arr) => line !== "" || (arr[i - 1] !== "" && i !== 0))
      .join("\n");
    const html = `
      <p>Hej,</p>
      <p>Bifogat finner du <strong>faktura ${this.escapeHtml(nr)}</strong>${opts.senderName ? ` från <strong>${this.escapeHtml(opts.senderName)}</strong>` : ""}.</p>
      ${opts.dueDate ? `<p>Förfallodatum: ${this.escapeHtml(opts.dueDate)}.</p>` : ""}
      ${opts.message ? `<p>${this.escapeHtml(opts.message)}</p>` : ""}
      <p>Med vänliga hälsningar<br>${this.escapeHtml(opts.senderName || "")}</p>
    `;

    if (!this.transporter) {
      this.logger.log(
        `Invoice email for ${to} (faktura ${nr}) — SMTP not configured, skipped`,
      );
      return { sent: false, to };
    }

    await this.transporter.sendMail({
      from: this.getFromAddress(),
      to,
      subject,
      text,
      html,
      attachments: [
        {
          filename: `faktura-${nr}.pdf`,
          content: opts.pdf,
          contentType: "application/pdf",
        },
      ],
    });
    return { sent: true, to };
  }

  // Expiry reminder for an employee certificate. Mirrors the push copy sent by
  // CertificateRemindersService so the two channels read the same. Recipients are
  // the company admin(s) and (optionally) the certificate holder. Log-only when
  // SMTP is unconfigured, so the cron is safe to call before SMTP is wired up.
  async sendCertificateReminderEmail(
    to: string | string[],
    opts: {
      holderName: string;
      certName: string;
      daysLeft: number;
      expiresAt?: Date | string | null;
    },
  ): Promise<void> {
    const recipients = (Array.isArray(to) ? to : [to])
      .map((address) => String(address || "").trim())
      .filter(Boolean);
    if (!recipients.length) return;

    const certName = opts.certName || "Certifikat";
    const holder = opts.holderName || "Anställd";
    const when =
      opts.daysLeft < 0
        ? `gick ut för ${Math.abs(opts.daysLeft)} dagar sedan`
        : opts.daysLeft === 0
          ? "går ut idag"
          : `går ut om ${opts.daysLeft} dagar`;
    const dateStr = opts.expiresAt
      ? new Date(opts.expiresAt).toISOString().slice(0, 10)
      : "";
    const subject =
      opts.daysLeft < 0 ? "Certifikat utgånget" : "Certifikat går snart ut";
    const line = `${holder} — certifikatet ${certName} ${when}${dateStr ? ` (${dateStr})` : ""}.`;
    const text = line;
    const html = `<p>${this.escapeHtml(holder)} — certifikatet <strong>${this.escapeHtml(certName)}</strong> ${this.escapeHtml(when)}${dateStr ? ` (${this.escapeHtml(dateStr)})` : ""}.</p>`;

    if (!this.transporter) {
      this.logger.log(
        `Certificate reminder (SMTP off) → ${recipients.join(", ")}: ${line}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.getFromAddress(),
      to: recipients,
      subject,
      text,
      html,
    });
  }

  async sendDemoRequestEmail(payload: DemoRequestPayload): Promise<void> {
    const recipients = this.getDemoRequestRecipients();
    const subject = "New demo request from byggexp.se";
    const text = [
      "New demo request submitted from byggexp.se/",
      "",
      `Name: ${payload.name}`,
      `Email: ${payload.email}`,
      `Phone: ${payload.phone}`,
    ].join("\n");
    const html = `
      <p>New demo request submitted from <strong>byggexp.se/ru</strong>.</p>
      <p><strong>Name:</strong> ${this.escapeHtml(payload.name)}</p>
      <p><strong>Email:</strong> ${this.escapeHtml(payload.email)}</p>
      <p><strong>Phone:</strong> ${this.escapeHtml(payload.phone)}</p>
    `;

    if (!this.transporter || recipients.length === 0) {
      const reason = !this.transporter
        ? "SMTP is not configured"
        : "DEMO_REQUEST_RECIPIENTS is not configured";
      this.logger.warn(`${reason}. Demo request email will be logged only.`);
      this.logger.log(
        `Demo request: ${payload.name} <${payload.email}> | phone: ${payload.phone}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.getFromAddress(),
      to: recipients,
      replyTo: payload.email,
      subject,
      text,
      html,
    });
  }
}
