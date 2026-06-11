import {
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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
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
  @UseInterceptors(FileInterceptor('photo', { storage: toolPhotoStorage }))
  create(
    @Request() req,
    @Body() createToolDto: CreateToolDto,
    @UploadedFile() file?: UploadedPhotoFile,
  ) {
    if (file) {
      createToolDto.photoUrl = `/uploads/tool-photos/${file.filename}`;
    }

    return this.toolsService.create(createToolDto, req.user);
  }

  @Put(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  @UseInterceptors(FileInterceptor('photo', { storage: toolPhotoStorage }))
  update(
    @Param('id') id: string,
    @Body() updateToolDto: UpdateToolDto,
    @UploadedFile() file?: UploadedPhotoFile,
  ) {
    if (file) {
      updateToolDto.photoUrl = `/uploads/tool-photos/${file.filename}`;
    }

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
