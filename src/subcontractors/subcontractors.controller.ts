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
import { SubcontractorsService } from "./subcontractors.service";
import {
  CreateSubcontractorDto,
  UpdateSubcontractorDto,
} from "./dto/subcontractor.dto";

@Controller("subcontractors")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class SubcontractorsController {
  constructor(private readonly subcontractorsService: SubcontractorsService) {}

  // The company's firms; a subcontractor's contact person gets its own only.
  @Get()
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Subcontractor,
  )
  findAll(@Request() req) {
    return this.subcontractorsService.findAll(req.user);
  }

  @Post()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  create(@Request() req, @Body() dto: CreateSubcontractorDto) {
    return this.subcontractorsService.create(dto, req.user);
  }

  @Put(":id")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  update(
    @Request() req,
    @Param("id") id: string,
    @Body() dto: UpdateSubcontractorDto,
  ) {
    return this.subcontractorsService.update(id, dto, req.user);
  }

  @Delete(":id")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  remove(@Request() req, @Param("id") id: string) {
    return this.subcontractorsService.remove(id, req.user);
  }
}
