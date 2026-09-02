import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { AnalyticsService } from "./analytics.service";
import { TrackEventsDto } from "./dto/track-events.dto";

type AuthedRequest = {
  user?: {
    userId?: string | null;
    companyId?: string | null;
    role?: UserRole | null;
  };
};

@Controller("analytics")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // Any signed-in user can report their own product events. The server derives
  // who/company/role from the JWT — the client can't spoof them.
  @Post("events")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  track(@Body() dto: TrackEventsDto, @Request() req: AuthedRequest) {
    return this.analyticsService.track(dto.events, {
      userId: req.user?.userId,
      companyId: req.user?.companyId,
      role: req.user?.role,
    });
  }

  // Onboarding funnel overview — superadmin only.
  @Get("onboarding/funnel")
  @Roles(UserRole.SuperAdmin)
  onboardingFunnel() {
    return this.analyticsService.onboardingFunnel();
  }
}
