import {
  Body,
  Controller,
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

  // Upsert an admin correction of planned hours for one worker-day-project.
  @Put("adjustment")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  saveAdjustment(@Request() req, @Body() dto: SaveAdjustmentDto) {
    return this.hoursService.saveAdjustment(req.user, dto);
  }
}
