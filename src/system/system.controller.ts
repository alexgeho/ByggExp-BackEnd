import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { MailService } from "../mail/mail.service";

// Superadmin diagnostics: which integrations are wired up. Reports only
// presence (boolean) — never the secret values themselves.
@Controller("system")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class SystemController {
  constructor(
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  private has(key: string): boolean {
    const v = this.configService.get<string>(key);
    return Boolean(v && String(v).trim());
  }

  @Get("integrations")
  @Roles(UserRole.SuperAdmin)
  getIntegrations() {
    return {
      smtp: this.mailService.isConfigured(),
      stripe: this.has("STRIPE_SECRET_KEY"),
      stripeWebhook: this.has("STRIPE_WEBHOOK_SECRET"),
      billingEnforced:
        String(this.configService.get("BILLING_ENFORCED")) === "true",
      deepl: this.has("DEEPL_API_KEY"),
      anthropic: this.has("ANTHROPIC_API_KEY"),
      inboundEmail: this.has("INBOUND_INVOICE_TOKEN"),
      appPublicUrl: this.has("APP_PUBLIC_URL") || this.has("API_PUBLIC_URL"),
    };
  }

  @Post("test-email")
  @Roles(UserRole.SuperAdmin)
  async sendTestEmail(@Body() body: { to?: string }, @Request() req) {
    const to = (body?.to || req.user?.email || "").trim();
    if (!to) {
      throw new BadRequestException("No recipient address");
    }
    try {
      await this.mailService.sendTestEmail(to);
      return { sent: true, to };
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : "Failed to send test email",
      );
    }
  }
}
