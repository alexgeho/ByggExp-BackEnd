import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import * as fs from "fs";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { CreateAtaDto } from "./dto/create-ata.dto";
import { UpdateAtaDto } from "./dto/update-ata.dto";
import { AtaStatus } from "./schemas/ata.schema";
import { AtaService } from "./ata.service";

const attachmentStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const dir = "./uploads/ata";
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const base =
      (file.originalname || "ata")
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .slice(0, 60) || "ata";
    cb(null, `${base}-${Date.now()}${extname(file.originalname) || ".pdf"}`);
  },
});

@Controller("ata")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
export class AtaController {
  constructor(private readonly service: AtaService) {}

  @Get()
  findAll(@Request() req, @Query("projectId") projectId?: string) {
    return this.service.findAll(req.user, projectId);
  }

  @Post()
  create(@Request() req, @Body() dto: CreateAtaDto) {
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
  update(@Request() req, @Param("id") id: string, @Body() dto: UpdateAtaDto) {
    return this.service.update(id, dto, req.user);
  }

  @Patch(":id/status")
  setStatus(
    @Request() req,
    @Param("id") id: string,
    @Body() body: { status: AtaStatus },
  ) {
    if (!Object.values(AtaStatus).includes(body?.status)) {
      throw new BadRequestException("Invalid status");
    }
    return this.service.setStatus(id, req.user, body.status);
  }

  @Post(":id/attachment")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: attachmentStorage,
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async uploadAttachment(
    @Request() req,
    @Param("id") id: string,
    @UploadedFile() file: { filename: string } | undefined,
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }
    return this.service.update(
      id,
      { attachmentUrl: `/uploads/ata/${file.filename}` },
      req.user,
    );
  }

  @Delete(":id")
  remove(@Request() req, @Param("id") id: string) {
    return this.service.remove(id, req.user);
  }
}
