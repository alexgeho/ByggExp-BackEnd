import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
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

  @Get(":id/pdf")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  async pdf(@Request() req, @Param("id") id: string, @Res() res: Response) {
    const buf = await this.service.buildPdf(id, req.user);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=projektkalkyl-${id}.pdf`,
      "Content-Length": buf.length,
    });
    res.end(buf);
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

  @Post(":id/share")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  share(@Request() req, @Param("id") id: string) {
    return this.service.createShareLink(id, req.user);
  }

  @Delete(":id/share")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  revokeShare(@Request() req, @Param("id") id: string) {
    return this.service.revokeShareLink(id, req.user);
  }

  @Post(":id/comments")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  addComment(
    @Request() req,
    @Param("id") id: string,
    @Body() body: { text?: string; authorName?: string },
  ) {
    return this.service.addComment(id, req.user, body?.authorName, body?.text);
  }

  @Delete(":id")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  remove(@Request() req, @Param("id") id: string) {
    return this.service.remove(id, req.user);
  }
}
