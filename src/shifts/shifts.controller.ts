import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  Request,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { ExportShiftsDto } from './dto/export-shifts.dto';
import { ListShiftsDto } from './dto/list-shifts.dto';
import { StartShiftDto } from './dto/start-shift.dto';
import { ShiftsService } from './shifts.service';

const shiftPhotosStorage = diskStorage({
  destination: './uploads/shift-photos',
  filename: (_req, file, callback) => {
    const safeBaseName = file.originalname
      .replace(extname(file.originalname), '')
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 80) || 'photo';

    callback(null, `${Date.now()}-${safeBaseName}${extname(file.originalname)}`);
  },
});

type UploadedPhotoFile = {
  originalname: string;
  filename: string;
  mimetype: string;
  size: number;
};

@Controller('shifts')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Post('start')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  start(@Request() req, @Body() dto: StartShiftDto) {
    return this.shiftsService.start(req.user, dto);
  }

  @Post(':id/pause')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  pause(@Request() req, @Param('id') id: string) {
    return this.shiftsService.pause(req.user, id);
  }

  @Post(':id/resume')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  resume(@Request() req, @Param('id') id: string) {
    return this.shiftsService.resume(req.user, id);
  }

  @Post(':id/complete')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  complete(@Request() req, @Param('id') id: string) {
    return this.shiftsService.complete(req.user, id);
  }

  @Post(':id/photos')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  @UseInterceptors(FilesInterceptor('photos', 10, { storage: shiftPhotosStorage }))
  uploadPhotos(
    @Request() req,
    @Param('id') id: string,
    @UploadedFiles() files: UploadedPhotoFile[],
  ) {
    const photos = (files || []).map((file) => ({
      name: file.originalname,
      url: `/uploads/shift-photos/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    }));

    return this.shiftsService.uploadPhotos(req.user, id, photos);
  }

  @Get('current')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  getCurrent(@Request() req, @Query('projectId') projectId?: string) {
    return this.shiftsService.getCurrent(req.user, projectId);
  }

  @Get('months')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  getMonths(@Request() req, @Query() query: ListShiftsDto) {
    return this.shiftsService.getMonths(req.user, query);
  }

  @Get('history')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  getHistory(@Request() req, @Query() query: ListShiftsDto) {
    return this.shiftsService.getHistory(req.user, query);
  }

  @Get('list')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  list(@Request() req, @Query() query: ListShiftsDto) {
    return this.shiftsService.list(req.user, query);
  }

  @Get('export')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  async export(
    @Request() req,
    @Query() query: ExportShiftsDto,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    const report = await this.shiftsService.export(req.user, query);
    res.setHeader('Content-Type', report.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);

    return new StreamableFile(report.buffer);
  }

  @Get(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  findOne(@Request() req, @Param('id') id: string) {
    return this.shiftsService.findOneAccessible(req.user, id);
  }
}
