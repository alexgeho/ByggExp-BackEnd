import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { CreateToolDto } from './dto/create-tool.dto';
import { UpdateToolDto } from './dto/update-tool.dto';
import { AttachToolsToProjectDto, AttachToolsToWorkerDto } from './dto/attach-tools.dto';
import { ToolsService } from './tools.service';

const toolPhotoStorage = diskStorage({
  destination: './uploads/tool-photos',
  filename: (_req, file, callback) => {
    const safeBaseName = file.originalname
      .replace(extname(file.originalname), '')
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 80) || 'tool';

    callback(null, `${Date.now()}-${safeBaseName}${extname(file.originalname)}`);
  },
});

type UploadedPhotoFile = {
  filename: string;
};

const MAX_TOOL_PHOTOS = 20;

const mapUploadedPhotos = (files: UploadedPhotoFile[] = []) =>
  files.map((file) => `/uploads/tool-photos/${file.filename}`);

const normalizeToolPhotoPayload = (
  dto: { photoUrl?: string; photoUrls?: string[] },
  files: UploadedPhotoFile[] = [],
) => {
  const uploadedUrls = mapUploadedPhotos(files);
  const existingUrls = Array.isArray(dto.photoUrls) ? dto.photoUrls.filter(Boolean) : [];
  const legacyUrl = dto.photoUrl && !existingUrls.includes(dto.photoUrl) ? [dto.photoUrl] : [];
  const photoUrls = [...existingUrls, ...legacyUrl, ...uploadedUrls];

  dto.photoUrls = photoUrls;
  dto.photoUrl = photoUrls[0] || '';
};

@Controller('tools')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

  @Get()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  findAllAccessible(@Request() req) {
    return this.toolsService.findAccessible(req.user);
  }

  @Post('attach-to-worker')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  attachToWorker(@Body() dto: AttachToolsToWorkerDto) {
    return this.toolsService.attachToWorker(dto.workerId, dto.toolIds);
  }

  @Post('attach-to-project')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  attachToProject(@Body() dto: AttachToolsToProjectDto) {
    return this.toolsService.attachToProject(dto.projectId, dto.toolIds);
  }

  @Post()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  @UseInterceptors(FilesInterceptor('photos', MAX_TOOL_PHOTOS, { storage: toolPhotoStorage }))
  create(
    @Request() req,
    @Body() createToolDto: CreateToolDto,
    @UploadedFiles() files?: UploadedPhotoFile[],
  ) {
    normalizeToolPhotoPayload(createToolDto, files);

    return this.toolsService.create(createToolDto, req.user);
  }

  @Put(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  @UseInterceptors(FilesInterceptor('photos', MAX_TOOL_PHOTOS, { storage: toolPhotoStorage }))
  update(
    @Param('id') id: string,
    @Body() updateToolDto: UpdateToolDto,
    @UploadedFiles() files?: UploadedPhotoFile[],
  ) {
    normalizeToolPhotoPayload(updateToolDto, files);

    return this.toolsService.update(id, updateToolDto);
  }

  @Delete(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  remove(@Param('id') id: string) {
    return this.toolsService.remove(id);
  }

  @Get(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  findOne(@Param('id') id: string) {
    return this.toolsService.findOne(id);
  }
}
