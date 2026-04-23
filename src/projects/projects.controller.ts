import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  NotFoundException,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { Project } from './schemas/project.schema';
import { CreateProjectDto } from './dto/create-project.dto';
import { AddWorkersToProjectDto } from './dto/add-workers.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '../users/schemas/user.schema';
import { ObjectIdPipe } from 'src/common/pipes/object-id.pipe';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

const documentsStorage = diskStorage({
  destination: './uploads/project-documents',
  filename: (_req, file, callback) => {
    const safeBaseName = file.originalname
      .replace(extname(file.originalname), '')
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 80) || 'document';

    callback(null, `${Date.now()}-${safeBaseName}${extname(file.originalname)}`);
  },
});

type UploadedDocumentFile = {
  originalname: string;
  filename: string;
  mimetype: string;
  size: number;
};

@Controller('projects')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  @UseInterceptors(FilesInterceptor('documents', 10, { storage: documentsStorage }))
  create(
    @Body() createProjectDto: CreateProjectDto,
    @UploadedFiles() files: UploadedDocumentFile[],
    @Request() req,
  ): Promise<Project> {
    if (req.user.role === UserRole.CompanyAdmin && !createProjectDto.companyId) {
      createProjectDto.companyId = req.user.companyId;
    }

    if (!createProjectDto.projectManagerId && req.user.role === UserRole.CompanyAdmin) {
      createProjectDto.projectManagerId = req.user.userId;
    }

    if (files?.length) {
      createProjectDto.documents = files.map((file) => ({
        name: file.originalname,
        url: `/uploads/project-documents/${file.filename}`,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
      }));
    }

    return this.projectsService.create(createProjectDto);
  }

  @Get()
  @Roles(UserRole.SuperAdmin)
  findAll(): Promise<Project[]> {
    return this.projectsService.findAll();
  }

  @Get('my')
  @Roles(UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  async findAllByUser(@Request() req): Promise<Project[]> {
    if (req.user.role === UserRole.CompanyAdmin) {
      // CompanyAdmin видит все проекты своей компании
      return this.projectsService.findAllByCompany(req.user.companyId);
    }
    // ProjectAdmin и Worker видят только свои проекты
    return this.projectsService.findAllByUser(req.user.userId);
  }

  @Get('info/:id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  async findProjectById(@Param('id') id: string) {
    const project = await this.projectsService.findProjectById(id);
    if (!project) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }
    return project;
  }

  @Post('by-ids')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  async findByIds(@Body() dto: { ids: string[] }) {
    const projects = await this.projectsService.findByIds(dto.ids);
    return projects.map(project => ({
      id: (project as any)._id.toString(),
      name: project.name,
      status: project.status,
      companyId: project.companyId,
      location: project.location,
    }));
  }

  @Get('company/:companyId')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  findAllByCompany(@Param('companyId') companyId: string): Promise<Project[]> {
    return this.projectsService.findAllByCompany(companyId);
  }

  @Get('populated')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  async findAllPopulated() {
    return this.projectsService.findAllPopulated();
  }

  @Get(':id/populated')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  findOnePopulated(@Param('id', ObjectIdPipe) id: string): Promise<Project> {
    return this.projectsService.findOneWithPopulated(id);
  }

  @Get(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  findOne(@Param('id', ObjectIdPipe) id: string): Promise<Project> {
    return this.projectsService.findOne(id);
  }

  @Post(':id/workers')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  addWorkers(
    @Param('id') id: string,
    @Body() addWorkersDto: AddWorkersToProjectDto,
    @Request() req,
  ): Promise<Project> {
    if (req.user.role === UserRole.ProjectAdmin) {
    }
    return this.projectsService.addWorkers(id, addWorkersDto.workerIds);
  }

  @Delete(':id/workers/:workerId')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  removeWorker(
    @Param('id') id: string,
    @Param('workerId') workerId: string,
  ): Promise<Project> {
    return this.projectsService.removeWorker(id, workerId);
  }

  @Post(':id/admins/:userId')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  addProjectAdmin(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<Project> {
    return this.projectsService.addProjectAdmin(id, userId);
  }

  @Put(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  update(
    @Param('id') id: string,
    @Body() updateProjectDto: Partial<CreateProjectDto>,
    @Request() req,
  ): Promise<Project> {
    if (req.user.role === UserRole.ProjectAdmin) {
    }
    return this.projectsService.update(id, updateProjectDto);
  }

  @Delete(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  remove(@Param('id') id: string): Promise<Project> {
    return this.projectsService.remove(id);
  }
}
