import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

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
    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') || 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    } else {
      this.logger.warn(
        'SMTP is not configured. Worker verification emails will be logged only.',
      );
    }
  }

  private getFromAddress(): string {
    return (
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('SMTP_USER') ||
      'noreply@byggexp.se'
    );
  }

  private getApiPublicUrl(): string {
    const configured =
      this.configService.get<string>('API_PUBLIC_URL') ||
      this.configService.get<string>('APP_PUBLIC_URL');

    if (configured) {
      return configured.replace(/\/$/, '');
    }

    const port = this.configService.get<string>('PORT') || '3000';
    return `http://localhost:${port}`;
  }

  private getDemoRequestRecipients(): string[] {
    return (
      this.configService.get<string>('DEMO_REQUEST_RECIPIENTS') ||
      this.configService.get<string>('DEMO_REQUEST_RECIPIENT') ||
      '870717ag@gmail.com'
    )
      .split(',')
      .map((recipient) => recipient.trim())
      .filter(Boolean);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async sendUserInviteEmail(
    email: string,
    name: string,
    token: string,
    password: string,
    roleLabel: string,
  ): Promise<void> {
    const verificationUrl = `${this.getApiPublicUrl()}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const subject = 'Your ByggExp account invitation';
    const text = [
      `Hi ${name},`,
      '',
      `You have been invited to ByggExp as ${roleLabel}.`,
      '',
      `Your temporary password: ${password}`,
      '',
      'Open the link below to confirm your email and sign in automatically:',
      verificationUrl,
      '',
      'You can also sign in later with your email and the password above.',
      'This link expires in 7 days.',
    ].join('\n');

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

  async sendDemoRequestEmail(payload: DemoRequestPayload): Promise<void> {
    const recipients = this.getDemoRequestRecipients();
    const subject = 'New demo request from byggexp.se/ru';
    const text = [
      'New demo request submitted from byggexp.se/ru.',
      '',
      `Name: ${payload.name}`,
      `Email: ${payload.email}`,
      `Phone: ${payload.phone}`,
    ].join('\n');
    const html = `
      <p>New demo request submitted from <strong>byggexp.se/ru</strong>.</p>
      <p><strong>Name:</strong> ${this.escapeHtml(payload.name)}</p>
      <p><strong>Email:</strong> ${this.escapeHtml(payload.email)}</p>
      <p><strong>Phone:</strong> ${this.escapeHtml(payload.phone)}</p>
    `;

    if (!this.transporter || recipients.length === 0) {
      const reason = !this.transporter
        ? 'SMTP is not configured'
        : 'DEMO_REQUEST_RECIPIENTS is not configured';
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
