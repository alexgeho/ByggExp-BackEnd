import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Response } from "express";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import {
  CreateChecklistDto,
  SignChecklistDto,
  UpdateChecklistDto,
} from "./dto/checklist.dto";
import { CreateTemplateDto, UpdateTemplateDto } from "./dto/template.dto";
import { ChecklistsService } from "./checklists.service";

@Controller("checklists")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
export class ChecklistsController {
  constructor(private readonly service: ChecklistsService) {}

  // ---- Templates (declared before :id routes so "templates" isn't captured) --

  @Get("templates")
  listTemplates(@Request() req) {
    return this.service.listTemplates(req.user);
  }

  @Post("templates")
  createTemplate(@Request() req, @Body() dto: CreateTemplateDto) {
    return this.service.createTemplate(dto, req.user);
  }

  @Put("templates/:id")
  updateTemplate(
    @Request() req,
    @Param("id") id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.service.updateTemplate(id, dto, req.user);
  }

  @Delete("templates/:id")
  removeTemplate(@Request() req, @Param("id") id: string) {
    return this.service.removeTemplate(id, req.user);
  }

  // ---- Checklists (egenkontroller) ----

  @Get()
  list(@Request() req, @Query("projectId") projectId?: string) {
    return this.service.listChecklists(req.user, projectId);
  }

  @Post()
  create(@Request() req, @Body() dto: CreateChecklistDto) {
    return this.service.createChecklist(dto, req.user);
  }

  @Get(":id")
  findOne(@Request() req, @Param("id") id: string) {
    return this.service.findChecklist(id, req.user);
  }

  @Put(":id")
  update(
    @Request() req,
    @Param("id") id: string,
    @Body() dto: UpdateChecklistDto,
  ) {
    return this.service.updateChecklist(id, dto, req.user);
  }

  @Post(":id/sign")
  sign(@Request() req, @Param("id") id: string, @Body() dto: SignChecklistDto) {
    return this.service.signChecklist(id, dto, req.user);
  }

  @Get(":id/pdf")
  async pdf(@Request() req, @Param("id") id: string, @Res() res: Response) {
    const checklist = await this.service.findChecklist(id, req.user);
    const slug =
      (checklist.title || "egenkontroll")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "egenkontroll";
    const buffer = await this.service.buildChecklistPdf(id, req.user);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=egenkontroll-${slug}.pdf`,
      "Content-Length": buffer.length,
    });
    res.end(buffer);
  }

  @Delete(":id")
  remove(@Request() req, @Param("id") id: string) {
    return this.service.removeChecklist(id, req.user);
  }
}
