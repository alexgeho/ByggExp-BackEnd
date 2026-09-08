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
import { Permissions } from "../common/decorators/permissions.decorator";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { PERMISSIONS } from "../common/permissions/permissions.constants";
import { ProjektkalkylService } from "./projektkalkyl.service";
import {
  CreateProjektkalkylDto,
  UpdateProjektkalkylDto,
} from "./dto/projektkalkyl.dto";

@Controller("projektkalkyl")
@UseGuards(AuthGuard("jwt"), PermissionsGuard)
export class ProjektkalkylController {
  constructor(private readonly service: ProjektkalkylService) {}

  @Get()
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  findAll(@Request() req) {
    return this.service.findAccessible(req.user);
  }

  @Post()
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  create(@Request() req, @Body() dto: CreateProjektkalkylDto) {
    return this.service.create(dto, req.user);
  }

  @Get(":id")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  findOne(@Request() req, @Param("id") id: string) {
    return this.service.findOne(id, req.user);
  }

  @Put(":id")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  update(
    @Request() req,
    @Param("id") id: string,
    @Body() dto: UpdateProjektkalkylDto,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(":id")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  remove(@Request() req, @Param("id") id: string) {
    return this.service.remove(id, req.user);
  }
}
