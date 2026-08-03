import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  NotFoundException,
  UseInterceptors,
  UploadedFiles,
} from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { Project } from "./schemas/project.schema";
import { CreateProjectDto } from "./dto/create-project.dto";
import { AddWorkersToProjectDto } from "./dto/add-workers.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthGuard } from "@nestjs/passport";
import { UserRole } from "../users/schemas/user.schema";
import { ObjectIdPipe } from "src/common/pipes/object-id.pipe";
import { FilesInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";

const documentsStorage = diskStorage({
  destination: "./uploads/project-documents",
  filename: (_req, file, callback) => {
    const safeBaseName =
      file.originalname
        .replace(extname(file.originalname), "")
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .slice(0, 80) || "document";

    callback(
      null,
      `${Date.now()}-${safeBaseName}${extname(file.originalname)}`,
    );
  },
});

type UploadedDocumentFile = {
  originalname: string;
  filename: string;
  mimetype: string;
  size: number;
};

@Controller("projects")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get("geocode/search")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  searchAddressSuggestions(
    @Query("query") query?: string,
    @Query("limit") limit?: string,
  ) {
    return this.projectsService.searchAddressSuggestions(
      query || "",
      limit ? Number(limit) : 8,
    );
  }

  @Get("geocode/reverse")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  reverseGeocode(
    @Query("lat") latitude?: string,
    @Query("lon") longitude?: string,
  ) {
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);

    if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
      throw new BadRequestException(
        "lat and lon query parameters are required",
      );
    }

    return this.projectsService.reverseGeocodeCoordinate(
      parsedLatitude,
      parsedLongitude,
    );
  }

  @Post()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  @UseInterceptors(
    FilesInterceptor("documents", 10, { storage: documentsStorage }),
  )
  create(
    @Body() createProjectDto: CreateProjectDto,
    @UploadedFiles() files: UploadedDocumentFile[],
    @Request() req,
  ): Promise<Project> {
    if (
      req.user.role === UserRole.CompanyAdmin &&
      !createProjectDto.companyId
    ) {
      createProjectDto.companyId = req.user.companyId;
    }

    if (
      !createProjectDto.projectManagerId &&
      req.user.role === UserRole.CompanyAdmin
    ) {
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

    return this.projectsService.create(createProjectDto, req.user);
  }

  @Get()
  @Roles(UserRole.SuperAdmin)
  findAll(@Request() req): Promise<Project[]> {
    // Superadmin is a tenant too — its project list is scoped to its own
    // company, never another company's projects.
    return req.user?.companyId
      ? this.projectsService.findAllByCompany(req.user.companyId)
      : this.projectsService.findAll();
  }

  @Get("my")
  @Roles(UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  async findAllByUser(@Request() req): Promise<Project[]> {
    if (req.user.role === UserRole.CompanyAdmin) {
      // CompanyAdmin sees all projects in its company
      return this.projectsService.findAllByCompany(req.user.companyId);
    }
    // ProjectAdmin and Worker see only their own projects
    return this.projectsService.findAllByUser(req.user.userId);
  }

  @Get("info/:id")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  async findProjectById(@Param("id") id: string, @Request() req) {
    await this.projectsService.assertProjectAccessById(id, req.user);
    const project = await this.projectsService.findProjectById(id);
    if (!project) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }
    return project;
  }

  @Post("by-ids")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  async findByIds(@Body() dto: { ids: string[] }, @Request() req) {
    const projects = await this.projectsService.findByIds(dto.ids, req.user);
    return projects.map((project) => ({
      id: (project as any)._id.toString(),
      name: project.name,
      status: project.status,
      companyId: project.companyId,
      location: project.location,
      locationLatitude: project.locationLatitude,
      locationLongitude: project.locationLongitude,
      locationRadiusMeters: project.locationRadiusMeters,
      shiftSchedule: project.shiftSchedule,
    }));
  }

  @Get("company/:companyId")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  findAllByCompany(
    @Param("companyId") companyId: string,
    @Request() req,
  ): Promise<Project[]> {
    // Non-superadmin can only ever list their own company, regardless of param.
    const scopedCompanyId =
      req.user.role === UserRole.SuperAdmin ? companyId : req.user.companyId;
    return this.projectsService.findAllByCompany(scopedCompanyId);
  }

  @Get("populated")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  async findAllPopulated(@Request() req) {
    return this.projectsService.findAllPopulated(req.user);
  }

  @Get(":id/populated")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  async findOnePopulated(
    @Param("id", ObjectIdPipe) id: string,
    @Request() req,
  ): Promise<Project> {
    await this.projectsService.assertProjectAccessById(id, req.user);
    return this.projectsService.findOneWithPopulated(id);
  }

  @Get(":id")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  async findOne(
    @Param("id", ObjectIdPipe) id: string,
    @Request() req,
  ): Promise<Project> {
    return this.projectsService.assertProjectAccessById(id, req.user);
  }

  @Post(":id/workers")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  async addWorkers(
    @Param("id") id: string,
    @Body() addWorkersDto: AddWorkersToProjectDto,
    @Request() req,
  ): Promise<Project> {
    await this.projectsService.assertProjectAccessById(id, req.user);
    return this.projectsService.addWorkers(id, addWorkersDto.workerIds);
  }

  @Delete(":id/workers/:workerId")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  async removeWorker(
    @Param("id") id: string,
    @Param("workerId") workerId: string,
    @Request() req,
  ): Promise<Project> {
    await this.projectsService.assertProjectAccessById(id, req.user);
    return this.projectsService.removeWorker(id, workerId);
  }

  @Post(":id/admins/:userId")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  async addProjectAdmin(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Request() req,
  ): Promise<Project> {
    await this.projectsService.assertProjectAccessById(id, req.user);
    return this.projectsService.addProjectAdmin(id, userId);
  }

  @Post(":id/documents")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  @UseInterceptors(
    FilesInterceptor("documents", 10, { storage: documentsStorage }),
  )
  async uploadDocuments(
    @Param("id") id: string,
    @UploadedFiles() files: UploadedDocumentFile[],
    @Request() req,
  ): Promise<Project> {
    await this.projectsService.assertProjectAccessById(id, req.user);

    const documents = (files || []).map((file) => ({
      name: file.originalname,
      url: `/uploads/project-documents/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    }));

    return this.projectsService.uploadDocuments(id, documents, req.user.userId);
  }

  @Put(":id")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  @UseInterceptors(
    FilesInterceptor("documents", 10, { storage: documentsStorage }),
  )
  async update(
    @Param("id") id: string,
    @Body() updateProjectDto: Partial<CreateProjectDto>,
    @UploadedFiles() files: UploadedDocumentFile[],
    @Request() req,
  ): Promise<Project> {
    await this.projectsService.assertProjectAccessById(id, req.user);

    // Non-superadmin can never move a project to another company via update.
    if (req.user.role !== UserRole.SuperAdmin) {
      delete updateProjectDto.companyId;
      delete (updateProjectDto as { clientCompanyId?: string }).clientCompanyId;
    }

    if (files?.length) {
      updateProjectDto.documents = files.map((file) => ({
        name: file.originalname,
        url: `/uploads/project-documents/${file.filename}`,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
      }));
    }

    return this.projectsService.update(id, updateProjectDto);
  }

  @Delete(":id")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  async remove(@Param("id") id: string, @Request() req): Promise<Project> {
    await this.projectsService.assertProjectAccessById(id, req.user);
    return this.projectsService.remove(id);
  }
}
