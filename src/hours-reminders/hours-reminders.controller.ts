import { Body, Controller, Post, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { NudgeHoursDto } from "./dto/nudge-hours.dto";
import { HoursRemindersService, NudgeResult } from "./hours-reminders.service";

@Controller("hours-reminders")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class HoursRemindersController {
  constructor(private readonly service: HoursRemindersService) {}

  // Send a one-off "log your hours" push to worker(s) right now.
  @Post("nudge")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  nudge(
    @Body() dto: NudgeHoursDto,
    @Request()
    req: { user: { userId: string; companyId?: string; role?: UserRole } },
  ): Promise<NudgeResult> {
    return this.service.nudge({
      companyId: req.user.companyId,
      role: req.user.role,
      userIds: dto.userIds,
      projectId: dto.projectId,
      onlyMissing: dto.onlyMissing,
    });
  }
}
