import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { CreatePlanningEntryDto } from "./dto/create-planning-entry.dto";
import { PlanningEntriesService } from "./planning-entries.service";

@Controller("planning-entries")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
export class PlanningEntriesController {
  constructor(private readonly service: PlanningEntriesService) {}

  @Get()
  findAll(@Request() req) {
    return this.service.findAll(req.user);
  }

  @Post()
  create(@Request() req, @Body() dto: CreatePlanningEntryDto) {
    return this.service.create(dto, req.user);
  }

  @Delete(":id")
  remove(@Request() req, @Param("id") id: string) {
    return this.service.remove(id, req.user);
  }
}
