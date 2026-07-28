import {
  BadRequestException,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { ScanningService } from "./scanning.service";

@Controller("scan")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(
  UserRole.SuperAdmin,
  UserRole.CompanyAdmin,
  UserRole.ProjectAdmin,
  UserRole.Worker,
)
export class ScanningController {
  constructor(private readonly service: ScanningService) {}

  @Get("status")
  status() {
    return { enabled: this.service.enabled };
  }

  // Extract fields from an uploaded receipt/invoice (image or PDF). The file is
  // held in memory and NOT persisted here — the caller saves it via the normal
  // expense/supplier-invoice attachment upload after reviewing the fields.
  @Post()
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 15 * 1024 * 1024 } }),
  )
  async scan(@UploadedFile() file?: { buffer: Buffer; mimetype: string }) {
    if (!file?.buffer) {
      throw new BadRequestException("No file uploaded");
    }
    return this.service.extract(file.buffer, file.mimetype);
  }
}
