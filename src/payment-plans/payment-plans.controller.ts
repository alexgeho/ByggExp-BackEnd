import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import {
  CreatePaymentPlanDto,
  SetRowStatusDto,
  UpdatePaymentPlanDto,
} from "./dto/payment-plan.dto";
import { PaymentPlansService } from "./payment-plans.service";

@Controller("payment-plans")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
export class PaymentPlansController {
  constructor(private readonly service: PaymentPlansService) {}

  @Get()
  findAll(@Request() req, @Query("projectId") projectId?: string) {
    return this.service.findAll(req.user, projectId);
  }

  @Post()
  create(@Request() req, @Body() dto: CreatePaymentPlanDto) {
    return this.service.create(dto, req.user);
  }

  @Get("project/:projectId/summary")
  projectSummary(@Request() req, @Param("projectId") projectId: string) {
    return this.service.projectSummary(projectId, req.user);
  }

  @Get(":id")
  findOne(@Request() req, @Param("id") id: string) {
    return this.service.findOne(id, req.user);
  }

  @Put(":id")
  update(
    @Request() req,
    @Param("id") id: string,
    @Body() dto: UpdatePaymentPlanDto,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Patch(":id/rows/:rowIndex/status")
  setRowStatus(
    @Request() req,
    @Param("id") id: string,
    @Param("rowIndex") rowIndex: string,
    @Body() dto: SetRowStatusDto,
  ) {
    return this.service.setRowStatus(id, Number(rowIndex), dto, req.user);
  }

  @Delete(":id")
  remove(@Request() req, @Param("id") id: string) {
    return this.service.remove(id, req.user);
  }
}
