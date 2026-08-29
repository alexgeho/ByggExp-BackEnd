import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { HoursService } from "./hours.service";
import { HoursQueryDto } from "./dto/hours-query.dto";
import { SaveAdjustmentDto } from "./dto/save-adjustment.dto";
import { DemoAdjustDto } from "./dto/demo-adjust.dto";

@Controller("hours")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class HoursController {
  constructor(private readonly hoursService: HoursService) {}

  // Aggregated hours grid: workers × days, planned (schedule + corrections) vs actual.
  @Get()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  getGrid(@Request() req, @Query() query: HoursQueryDto) {
    return this.hoursService.getGrid(req.user, query);
  }

  // Labor cost (worked hours × each worker's hourly rate) grouped by project,
  // for the profitability report.
  @Get("labor-cost")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  laborCost(@Request() req) {
    return this.hoursService.laborCostByProject(req.user);
  }

  // Upsert an admin correction of planned hours for one worker-day-project.
  @Put("adjustment")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  saveAdjustment(@Request() req, @Body() dto: SaveAdjustmentDto) {
    return this.hoursService.saveAdjustment(req.user, dto);
  }

  // TEMPORARY — demo/video helper to tweak GPS/Manual hours on existing shifts.
  // Remove after recording.
  @Post("demo")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  demoAdjust(@Request() req, @Body() dto: DemoAdjustDto) {
    return this.hoursService.demoAdjust(req.user, dto);
  }
}
