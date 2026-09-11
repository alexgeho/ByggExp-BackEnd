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
import { SaveBudgetDto } from "./dto/save-budget.dto";
import { BudgetService } from "./budget.service";

@Controller("budget")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
export class BudgetController {
  constructor(private readonly service: BudgetService) {}

  @Get()
  getYear(@Request() req, @Query("year") year?: string) {
    const y = Number(year) || new Date().getFullYear();
    return this.service.getYear(req.user, y);
  }

  @Put()
  save(@Request() req, @Body() dto: SaveBudgetDto) {
    return this.service.save(req.user, dto);
  }
}
