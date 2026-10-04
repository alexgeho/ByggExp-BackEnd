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
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import * as fs from "fs";
import { diskStorage, memoryStorage } from "multer";
import { extname } from "path";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import {
  CreateChecklistDto,
  SignChecklistDto,
  SuggestionDecisionDto,
  UpdateChecklistDto,
} from "./dto/checklist.dto";
import { CreateTemplateDto, UpdateTemplateDto } from "./dto/template.dto";
import { ChecklistsService, UploadedPhoto } from "./checklists.service";

const IMAGE_OR_HEIC = /^image\/|heic|heif/i;

const photoStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const dir = "./uploads/checklist-photos";
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = (extname(file.originalname || "") || ".jpg").toLowerCase();
    cb(null, `foto-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});

function saveSourceDocument(file: { buffer: Buffer; originalname: string }) {
  const dir = "./uploads/checklist-documents";
  fs.mkdirSync(dir, { recursive: true });
  const ext = (extname(file.originalname || "") || ".pdf").toLowerCase();
  const name = `underlag-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
  fs.writeFileSync(`${dir}/${name}`, file.buffer);
  return { url: `/uploads/checklist-documents/${name}`, name: file.originalname || name };
}

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

  // ---- AI egenkontroll ----

  @Get("ai-status")
  aiStatus() {
    return this.service.aiStatus();
  }

  // Contract / arbetsbeskrivning → proposed points. Nothing is saved except the
  // uploaded file, whose url is returned so the created checklist can link it.
  @Post("draft-from-document")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async draftFromDocument(
    @UploadedFile()
    file: { buffer: Buffer; mimetype: string; originalname: string } | undefined,
    @Body("text") text?: string,
  ) {
    if (!file && !text?.trim()) {
      throw new BadRequestException("Upload a document or paste the text");
    }
    const draft = await this.service.draftFromDocument(
      file ? { buffer: file.buffer, mimetype: file.mimetype } : null,
      text || "",
    );
    return { ...draft, sourceDocument: file ? saveSourceDocument(file) : null };
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

  @Post(":id/photos")
  @UseInterceptors(
    FilesInterceptor("photos", 20, {
      storage: photoStorage,
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) =>
        cb(null, IMAGE_OR_HEIC.test(file.mimetype) || IMAGE_OR_HEIC.test(file.originalname)),
    }),
  )
  addPhotos(
    @Request() req,
    @Param("id") id: string,
    @UploadedFiles() files: UploadedPhoto[] | undefined,
  ) {
    if (!files?.length) throw new BadRequestException("No photos uploaded");
    return this.service.addPhotos(id, files, req.user);
  }

  @Post(":id/analyze")
  analyze(@Request() req, @Param("id") id: string) {
    return this.service.analyze(id, req.user);
  }

  @Post(":id/items/:index/suggestion")
  decideSuggestion(
    @Request() req,
    @Param("id") id: string,
    @Param("index") index: string,
    @Body() dto: SuggestionDecisionDto,
  ) {
    return this.service.decideSuggestion(id, Number(index), dto.accept, req.user);
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
