import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { ModerationService } from "./moderation.service";
import { CreateReportDto } from "./dto/create-report.dto";

@Controller("moderation")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  // --- Blocking (any authenticated user, acts only on the caller) ---

  @Get("blocked")
  listBlocked(@Request() req) {
    return this.moderationService.listBlocked(req.user.userId);
  }

  @Post("block/:userId")
  block(@Request() req, @Param("userId") userId: string) {
    return this.moderationService.block(
      req.user.userId,
      userId,
      req.user.companyId,
    );
  }

  @Delete("block/:userId")
  unblock(@Request() req, @Param("userId") userId: string) {
    return this.moderationService.unblock(req.user.userId, userId);
  }

  // --- Reporting (any user files; company admins review) ---

  @Post("report")
  createReport(@Request() req, @Body() dto: CreateReportDto) {
    return this.moderationService.createReport(req.user, dto);
  }

  @Get("reports")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  listReports(@Request() req) {
    return this.moderationService.listReports(req.user);
  }

  @Patch("reports/:id/resolve")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  resolveReport(@Request() req, @Param("id") id: string) {
    return this.moderationService.resolveReport(id, req.user);
  }
}
