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
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FilesInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import * as fs from "fs";
import { diskStorage } from "multer";
import { extname } from "path";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { LABELS } from "./deviation.logic";
import type { DeviationListQuery } from "./deviation.logic";
import {
  CloseDeviationDto,
  CreateDeviationDto,
  ReopenDeviationDto,
  UpdateDeviationDto,
} from "./dto/deviation.dto";
import { DeviationsService } from "./deviations.service";
import type { UploadedDeviationPhoto } from "./deviations.service";

const IMAGE_OR_HEIC = /^image\/|heic|heif/i;

const photoStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const dir = "./uploads/deviation-photos";
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = (extname(file.originalname || "") || ".jpg").toLowerCase();
    cb(null, `avvik-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});

const fileSlug = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

// Avvik / Avvikelse / Deviation. Every role may report and read within its
// projects; the service decides what each may change (see deviation.logic).
@Controller("deviations")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(
  UserRole.SuperAdmin,
  UserRole.CompanyAdmin,
  UserRole.ProjectAdmin,
  UserRole.Worker,
)
export class DeviationsController {
  constructor(private readonly service: DeviationsService) {}

  // ---- fixed paths first so they aren't captured by :id ----

  @Get()
  list(@Request() req, @Query() query: DeviationListQuery) {
    return this.service.list(req.user, query);
  }

  @Get("summary")
  summary(@Request() req, @Query("projectId") projectId?: string) {
    return this.service.summary(req.user, projectId);
  }

  @Get("prefill")
  prefill(
    @Request() req,
    @Query("checklistId") checklistId?: string,
    @Query("itemIndex") itemIndex?: string,
    @Query("dagbokId") dagbokId?: string,
  ) {
    return this.service.prefill(req.user, { checklistId, itemIndex, dagbokId });
  }

  @Get("responsible-options")
  responsibleOptions(@Request() req, @Query("projectId") projectId: string) {
    if (!projectId) throw new BadRequestException("projectId is required");
    return this.service.responsibleOptions(req.user, projectId);
  }

  @Get("export.csv")
  async exportCsv(
    @Request() req,
    @Query() query: DeviationListQuery,
    @Res() res: Response,
  ) {
    const { csv, lang } = await this.service.exportCsv(req.user, query);
    const name = fileSlug(LABELS[lang].report) || "deviations";
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${name}.csv`,
    });
    res.end(csv);
  }

  @Get("export.pdf")
  async exportPdf(
    @Request() req,
    @Query() query: DeviationListQuery,
    @Res() res: Response,
  ) {
    const { buffer, lang } = await this.service.exportPdf(req.user, query);
    const name = fileSlug(LABELS[lang].report) || "deviations";
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${name}.pdf`,
      "Content-Length": buffer.length,
    });
    res.end(buffer);
  }

  @Post()
  create(@Request() req, @Body() dto: CreateDeviationDto) {
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
    @Body() dto: UpdateDeviationDto,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Post(":id/close")
  close(
    @Request() req,
    @Param("id") id: string,
    @Body() dto: CloseDeviationDto,
  ) {
    return this.service.close(id, dto, req.user);
  }

  @Post(":id/reopen")
  reopen(
    @Request() req,
    @Param("id") id: string,
    @Body() dto: ReopenDeviationDto,
  ) {
    return this.service.reopen(id, dto, req.user);
  }

  @Post(":id/photos")
  @UseInterceptors(
    FilesInterceptor("photos", 10, {
      storage: photoStorage,
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) =>
        cb(
          null,
          IMAGE_OR_HEIC.test(file.mimetype) ||
            IMAGE_OR_HEIC.test(file.originalname),
        ),
    }),
  )
  addPhotos(
    @Request() req,
    @Param("id") id: string,
    @UploadedFiles() files: UploadedDeviationPhoto[] | undefined,
  ) {
    if (!files?.length) throw new BadRequestException("No photos uploaded");
    return this.service.addPhotos(id, files, req.user);
  }

  @Delete(":id")
  remove(@Request() req, @Param("id") id: string) {
    return this.service.remove(id, req.user);
  }
}
