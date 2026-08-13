import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { NudgeHoursDto } from "./dto/nudge-hours.dto";
import { UpdateHoursRuleDto } from "./dto/update-hours-rule.dto";
import { HoursRemindersService, NudgeResult } from "./hours-reminders.service";

type AuthedRequest = {
  user: { userId: string; companyId?: string; role?: UserRole };
};

@Controller("hours-reminders")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class HoursRemindersController {
  constructor(private readonly service: HoursRemindersService) {}

  // Send a one-off "log your hours" push to worker(s) right now.
  @Post("nudge")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  nudge(
    @Body() dto: NudgeHoursDto,
    @Request() req: AuthedRequest,
  ): Promise<NudgeResult> {
    return this.service.nudge({
      companyId: req.user.companyId,
      role: req.user.role,
      userIds: dto.userIds,
      projectId: dto.projectId,
      onlyMissing: dto.onlyMissing,
    });
  }

  // Read the caller company's recurring reminder rule.
  @Get("rule")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  getRule(@Request() req: AuthedRequest) {
    return this.service.getRule(req.user.companyId);
  }

  // Update the caller company's recurring reminder rule.
  @Put("rule")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  updateRule(@Body() dto: UpdateHoursRuleDto, @Request() req: AuthedRequest) {
    return this.service.updateRule(req.user.companyId, dto);
  }
}
