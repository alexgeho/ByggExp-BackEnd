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
  CreateLeaveDto,
  ReviewLeaveDto,
  UpdateLeaveDto,
} from "./dto/leave.dto";
import { LeaveService } from "./leave.service";

const ADMIN = [
  UserRole.SuperAdmin,
  UserRole.CompanyAdmin,
  UserRole.ProjectAdmin,
];

@Controller("leave")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(
  UserRole.SuperAdmin,
  UserRole.CompanyAdmin,
  UserRole.ProjectAdmin,
  UserRole.Worker,
)
export class LeaveController {
  constructor(private readonly service: LeaveService) {}

  @Get()
  findAll(
    @Request() req,
    @Query("status") status?: string,
    @Query("userId") userId?: string,
  ) {
    return this.service.findAll(req.user, { status, userId });
  }

  @Post()
  create(@Request() req, @Body() dto: CreateLeaveDto) {
    return this.service.create(dto, req.user);
  }

  @Get(":id")
  findOne(@Request() req, @Param("id") id: string) {
    return this.service.findOne(id, req.user);
  }

  @Put(":id")
  update(@Request() req, @Param("id") id: string, @Body() dto: UpdateLeaveDto) {
    return this.service.update(id, dto, req.user);
  }

  @Patch(":id/review")
  @Roles(...ADMIN)
  review(@Request() req, @Param("id") id: string, @Body() dto: ReviewLeaveDto) {
    return this.service.review(id, dto, req.user);
  }

  @Delete(":id")
  remove(@Request() req, @Param("id") id: string) {
    return this.service.remove(id, req.user);
  }
}
