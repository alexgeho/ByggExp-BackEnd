import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { GoalsService } from "./goals.service";
import { UpdateGoalDto } from "./dto/update-goal.dto";

type AuthedRequest = {
  user: { userId: string; companyId?: string; role?: UserRole };
};

@Controller("goals")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class GoalsController {
  constructor(private readonly service: GoalsService) {}

  @Get("project/:projectId")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  getByProject(
    @Param("projectId") projectId: string,
    @Request() req: AuthedRequest,
  ) {
    return this.service.getByProject(
      projectId,
      req.user.companyId,
      req.user.role,
    );
  }

  @Put("project/:projectId")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  update(
    @Param("projectId") projectId: string,
    @Body() dto: UpdateGoalDto,
    @Request() req: AuthedRequest,
  ) {
    return this.service.update(
      projectId,
      dto,
      req.user.companyId,
      req.user.role,
    );
  }
}
