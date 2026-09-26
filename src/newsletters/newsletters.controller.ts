import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { diskStorage } from "multer";
import { extname } from "path";
import * as fs from "fs";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { NewslettersService } from "./newsletters.service";

class CreateNewsletterDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsBoolean() blank?: boolean;
  @IsOptional() @IsIn(["newsletter", "personal"]) template?:
    | "newsletter"
    | "personal";
}

// Blocks/settings are free-form JSON here; the service normalises them
// (whitelists fields per block type) before storing or rendering.
class NewsletterContentDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(300) subject?: string;
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
  @IsOptional() @IsArray() blocks?: Record<string, unknown>[];
}

class SendTestDto {
  @IsOptional() @IsEmail() to?: string;
}

const IMAGE_DIR = "./uploads/newsletter";
const IMAGE_TYPES = /^image\/(jpeg|png|gif|webp)$/;

const imageStorage = diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
    cb(null, IMAGE_DIR);
  },
  filename: (_req, file, cb) => {
    const base =
      (file.originalname || "bild")
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .slice(0, 60) || "bild";
    const ext = (extname(file.originalname) || ".jpg").toLowerCase();
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});

// Images in a mail must be absolute URLs on a public host.
const apiBase = () =>
  (process.env.API_PUBLIC_URL || "https://api.byggexp.se").replace(/\/+$/, "");

const userId = (req: { user?: { userId?: unknown } }) =>
  req.user?.userId ? String(req.user.userId) : null;

// Superadmin-only newsletter builder (ByggExp's own marketing mailings).
@Controller("newsletters")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(UserRole.SuperAdmin)
export class NewslettersController {
  constructor(private readonly service: NewslettersService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() dto: CreateNewsletterDto, @Request() req) {
    return this.service.create(
      dto.title || "",
      Boolean(dto.blank),
      userId(req),
      dto.template,
    );
  }

  // Live preview for the editor: renders unsaved content without storing it.
  @Post("preview")
  preview(@Body() dto: NewsletterContentDto) {
    return this.service.render(dto);
  }

  @Post("images")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: imageStorage,
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) =>
        cb(
          IMAGE_TYPES.test(file.mimetype)
            ? null
            : new BadRequestException("Only JPG, PNG, GIF or WebP images"),
          IMAGE_TYPES.test(file.mimetype),
        ),
    }),
  )
  uploadImage(@UploadedFile() file: { filename: string } | undefined) {
    if (!file) throw new BadRequestException("No file uploaded");
    return { url: `${apiBase()}/uploads/newsletter/${file.filename}` };
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Put(":id")
  update(
    @Param("id") id: string,
    @Body() dto: NewsletterContentDto,
    @Request() req,
  ) {
    return this.service.update(id, dto, userId(req));
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }

  @Post(":id/duplicate")
  duplicate(@Param("id") id: string, @Request() req) {
    return this.service.duplicate(id, userId(req));
  }

  // Rendered HTML of the saved version — for download / pasting elsewhere.
  @Get(":id/html")
  async html(@Param("id") id: string) {
    const { html, text } = await this.service.renderStored(id);
    return { html, text };
  }

  @Post(":id/test")
  async sendTest(
    @Param("id") id: string,
    @Body() dto: SendTestDto,
    @Request() req,
  ) {
    const to = (dto.to || req.user?.email || "").trim();
    if (!to) throw new BadRequestException("No recipient address");
    try {
      return await this.service.sendTest(id, to);
    } catch (err) {
      if (err instanceof Error && err.message === "SMTP is not configured") {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
