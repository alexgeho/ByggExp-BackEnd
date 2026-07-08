import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { BugReportsService } from './bug-reports.service';
import { CreateBugReportDto } from './dto/create-bug-report.dto';
import { UpdateBugReportStatusDto } from './dto/update-bug-report-status.dto';

const bugReportAttachmentStorage = diskStorage({
  destination: './uploads/bug-reports',
  filename: (_req, file, callback) => {
    const safeBaseName =
      file.originalname
        .replace(extname(file.originalname), '')
        .replace(/[^a-zA-Z0-9-_]/g, '_')
        .slice(0, 80) || 'bug-report';

    callback(null, `${Date.now()}-${safeBaseName}${extname(file.originalname)}`);
  },
});

type UploadedBugReportFile = {
  filename: string;
  originalname: string;
  mimetype?: string;
  size?: number;
};

@Controller('bug-reports')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class BugReportsController {
  constructor(private readonly bugReportsService: BugReportsService) {}

  @Post()
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  @UseInterceptors(
    FileInterceptor('attachment', { storage: bugReportAttachmentStorage }),
  )
  create(
    @Request() req,
    @Body() createBugReportDto: CreateBugReportDto,
    @UploadedFile() file?: UploadedBugReportFile,
  ) {
    const attachment = file
      ? {
          name: file.originalname,
          url: `/uploads/bug-reports/${file.filename}`,
          mimeType: file.mimetype,
          size: file.size,
        }
      : null;

    return this.bugReportsService.create(
      createBugReportDto,
      req.user,
      attachment,
    );
  }

  @Get()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  findAll(@Request() req) {
    return this.bugReportsService.findAccessible(req.user);
  }

  @Patch(':id/status')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateBugReportStatusDto,
    @Request() req,
  ) {
    return this.bugReportsService.updateStatus(id, dto.status, req.user);
  }
}
