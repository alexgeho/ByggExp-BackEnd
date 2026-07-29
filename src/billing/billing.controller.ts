import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  Request,
  UseGuards,
} from "@nestjs/common";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { BillingService } from "./billing.service";
import { isInterval, isPlanTier } from "./plans";

const appBaseUrl = (): string =>
  process.env.APP_PUBLIC_URL || "https://admin.byggexp.se";

// Global JwtAuthGuard (APP_GUARD) already enforces auth and honours @Public,
// so the class only needs RolesGuard for the role-restricted routes.
@Controller("billing")
@UseGuards(RolesGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("status")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  status(@Request() req) {
    return this.billing.getStatus(req.user.companyId);
  }

  @Get("plans")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  plans() {
    return this.billing.getPlans();
  }

  @Post("checkout")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  checkout(@Request() req, @Body() body: { plan?: string; interval?: string }) {
    if (!isPlanTier(body.plan) || !isInterval(body.interval)) {
      throw new BadRequestException("Invalid plan or interval");
    }
    return this.billing.createCheckout(
      req.user.companyId,
      body.plan,
      body.interval,
      appBaseUrl(),
    );
  }

  @Post("portal")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  portal(@Request() req) {
    return this.billing.createPortal(req.user.companyId, appBaseUrl());
  }

  // Stripe → us. Public + signature-verified against STRIPE_WEBHOOK_SECRET.
  @Public()
  @Post("webhook")
  async webhook(
    @Req() req: { rawBody?: Buffer },
    @Headers("stripe-signature") signature: string,
  ) {
    const event = this.billing.constructEvent(req.rawBody as Buffer, signature);
    await this.billing.handleEvent(event);
    return { received: true };
  }
}
