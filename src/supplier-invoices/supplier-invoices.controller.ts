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
import { CreateSupplierInvoiceDto } from "./dto/create-supplier-invoice.dto";
import { SupplierInvoiceStatus } from "./schemas/supplier-invoice.schema";
import { SupplierInvoicesService } from "./supplier-invoices.service";

const attachmentStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const dir = "./uploads/supplier-invoices";
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const base =
      (file.originalname || "invoice")
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .slice(0, 60) || "invoice";
    cb(null, `${base}-${Date.now()}${extname(file.originalname) || ".pdf"}`);
  },
});

@Controller("supplier-invoices")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
export class SupplierInvoicesController {
  constructor(private readonly service: SupplierInvoicesService) {}

  @Get()
  findAll(@Request() req, @Query("projectId") projectId?: string) {
    return this.service.findAll(req.user, projectId);
  }

  @Post()
  create(@Request() req, @Body() dto: CreateSupplierInvoiceDto) {
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
  update(
    @Request() req,
    @Param("id") id: string,
    @Body() dto: CreateSupplierInvoiceDto,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Patch(":id/status")
  setStatus(
    @Request() req,
    @Param("id") id: string,
    @Body() body: { status: SupplierInvoiceStatus },
  ) {
    if (!Object.values(SupplierInvoiceStatus).includes(body?.status)) {
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
    const url = `/uploads/supplier-invoices/${file.filename}`;
    return this.service.update(id, { attachmentUrl: url }, req.user);
  }

  @Delete(":id")
  remove(@Request() req, @Param("id") id: string) {
    return this.service.remove(id, req.user);
  }
}
