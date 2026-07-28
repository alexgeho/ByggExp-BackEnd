import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { CreateDagbokDto } from "./dto/create-dagbok.dto";
import { UpdateDagbokDto } from "./dto/update-dagbok.dto";
import { DagbokService } from "./dagbok.service";

const photoStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const dir = "./uploads/dagbok";
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const base =
      (file.originalname || "dagbok")
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .slice(0, 60) || "dagbok";
    cb(null, `${base}-${Date.now()}${extname(file.originalname) || ".jpg"}`);
  },
});

@Controller("dagbok")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(
  UserRole.SuperAdmin,
  UserRole.CompanyAdmin,
  UserRole.ProjectAdmin,
  UserRole.Worker,
)
export class DagbokController {
  constructor(private readonly service: DagbokService) {}

  @Get()
  findAll(@Request() req, @Query("projectId") projectId?: string) {
    return this.service.findAll(req.user, projectId);
  }

  @Post()
  create(@Request() req, @Body() dto: CreateDagbokDto) {
    return this.service.create(dto, req.user);
  }

  @Get(":id")
  findOne(@Request() req, @Param("id") id: string) {
    return this.service.findOne(id, req.user);
  }

  @Put(":id")
  update(
    @Request() req,
    @Param("id") id: string,
    @Body() dto: UpdateDagbokDto,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Post(":id/photo")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: photoStorage,
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async uploadPhoto(
    @Request() req,
    @Param("id") id: string,
    @UploadedFile() file: { filename: string } | undefined,
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }
    return this.service.addPhoto(
      id,
      req.user,
      `/uploads/dagbok/${file.filename}`,
    );
  }

  @Delete(":id")
  remove(@Request() req, @Param("id") id: string) {
    return this.service.remove(id, req.user);
  }
}
