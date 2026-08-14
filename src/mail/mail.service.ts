import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { Transporter } from "nodemailer";

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
    return (
      this.configService.get<string>("SMTP_FROM") ||
      this.configService.get<string>("SMTP_USER") ||
      "noreply@byggexp.se"
    );
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

  // Invite the recipient to set up a company's admin account. No password —
  // they create their own on the acceptance page; no User exists until then.
  async sendCompanyInviteEmail(
    email: string,
    companyName: string,
    token: string,
  ): Promise<void> {
    const acceptUrl = `${this.getWebAppUrl()}/invite?token=${encodeURIComponent(token)}`;
    const name = this.escapeHtml(companyName || "your company");
    const subject = "You are invited to ByggExp";
    const text = [
      `You have been invited to set up ${companyName || "your company"} on ByggExp.`,
      "",
      "Open the link below to create your admin account (name + password):",
      acceptUrl,
      "",
      "This invitation expires in 7 days.",
    ].join("\n");
    const html = `
      <p>You have been invited to set up <strong>${name}</strong> on <strong>ByggExp</strong>.</p>
      <p>Open the link below to create your admin account:</p>
      <p><a href="${acceptUrl}">Accept invitation and create account</a></p>
      <p>This invitation expires in 7 days.</p>
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
    password: string,
    roleLabel: string,
  ): Promise<void> {
    const verificationUrl = `${this.getApiPublicUrl()}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const subject = "Your ByggExp account invitation";
    const text = [
      `Hi ${name},`,
      "",
      `You have been invited to ByggExp as ${roleLabel}.`,
      "",
      `Your temporary password: ${password}`,
      "",
      "Open the link below to confirm your email and sign in automatically:",
      verificationUrl,
      "",
      "You can also sign in later with your email and the password above.",
      "This link expires in 7 days.",
    ].join("\n");

    const html = `
      <p>Hi ${name},</p>
      <p>You have been invited to <strong>ByggExp</strong> as <strong>${roleLabel}</strong>.</p>
      <p><strong>Your temporary password:</strong> ${password}</p>
      <p>Open the link below to confirm your email and sign in automatically:</p>
      <p><a href="${verificationUrl}">Confirm email and sign in</a></p>
      <p>You can also sign in later with your email and the password above.</p>
      <p>This link expires in 7 days.</p>
    `;

    if (!this.transporter) {
      this.logger.log(
        `User invite email for ${email} (${roleLabel}): ${verificationUrl} | password: ${password}`,
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
    adminMagicCode: string;
    trialDays: number;
    maxUsers: number;
  }): Promise<void> {
    const adminLink = `${this.getApiPublicUrl()}/auth/web-magic?code=${encodeURIComponent(
      opts.adminMagicCode,
    )}`;
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
    const html = `
      <p>Hi ${name},</p>
      <p>Your company <strong>${companyName}</strong> is set up on <strong>ByggExp</strong> and your <strong>${opts.trialDays}-day free trial</strong> has started (up to <strong>${opts.maxUsers} users</strong>).</p>
      <p>Sign in on the mobile app and the web admin panel with your email and the password you chose at sign-up.</p>
      <p><strong>Open the web admin panel:</strong></p>
      <p><a href="${adminLink}">Sign in to the ByggExp admin panel</a></p>
      <p>Welcome aboard!</p>
    `;

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
    });
  }

  // Sent at sign-up step 1: the 6-digit code the user must enter to confirm
  // their email before the account is created.
  async sendVerificationCodeEmail(
    email: string,
    name: string,
    code: string,
  ): Promise<void> {
    const safeName = this.escapeHtml(name || "there");
    const subject = "Confirm your email — your ByggExp code";
    const text = [
      `Hi ${name || "there"},`,
      "",
      `Your ByggExp confirmation code: ${code}`,
      "Enter it in the app to finish creating your account.",
      "It expires in 30 minutes.",
      "",
      "If you didn't request this, you can ignore this email.",
    ].join("\n");
    const html = `
      <p>Hi ${safeName},</p>
      <p>Your ByggExp confirmation code:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:8px 0;">${this.escapeHtml(code)}</p>
      <p style="color:#5a6b7d;font-size:13px;">Enter it in the app to finish creating your account. It expires in 30 minutes.</p>
      <p style="color:#5a6b7d;font-size:13px;">If you didn't request this, you can ignore this email.</p>
    `;

    if (!this.transporter) {
      this.logger.log(`Verification code for ${email}: ${code}`);
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

  // A fresh 6-digit sign-in code for app re-login (requested from the app).
  async sendLoginCodeEmail(
    email: string,
    name: string,
    code: string,
  ): Promise<void> {
    const safeName = this.escapeHtml(name || "there");
    const subject = "Your ByggExp sign-in code";
    const text = [
      `Hi ${name || "there"},`,
      "",
      `Your ByggExp sign-in code: ${code}`,
      "It expires in 15 minutes.",
      "",
      "If you didn't request this, you can ignore this email.",
    ].join("\n");
    const html = `
      <p>Hi ${safeName},</p>
      <p>Your ByggExp sign-in code:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:8px 0;">${this.escapeHtml(code)}</p>
      <p style="color:#5a6b7d;font-size:13px;">It expires in 15 minutes.</p>
      <p style="color:#5a6b7d;font-size:13px;">If you didn't request this, you can ignore this email.</p>
    `;

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
      this.logger.log(`Certificate reminder (SMTP off) → ${recipients.join(", ")}: ${line}`);
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
