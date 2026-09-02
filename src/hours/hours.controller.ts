import {
  Body,
  Controller,
  Delete,
  Get,
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

  // Clear all planned corrections for a project in a date range, so those cells
  // fall back to the schedule-derived baseline again.
  @Delete("adjustments")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  resetAdjustments(
    @Request() req,
    @Query("projectId") projectId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.hoursService.resetAdjustments(req.user, { projectId, from, to });
  }
}
