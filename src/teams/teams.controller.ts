import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { TeamsService } from "./teams.service";
import { CreateTeamDto, UpdateTeamDto } from "./dto/team.dto";

@Controller("teams")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  findAll(@Request() req) {
    return this.teamsService.findAll(req.user);
  }

  @Post()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  create(@Request() req, @Body() dto: CreateTeamDto) {
    return this.teamsService.create(dto, req.user);
  }

  @Put(":id")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  update(@Request() req, @Param("id") id: string, @Body() dto: UpdateTeamDto) {
    return this.teamsService.update(id, dto, req.user);
  }

  @Delete(":id")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  remove(@Request() req, @Param("id") id: string) {
    return this.teamsService.remove(id, req.user);
  }
}
