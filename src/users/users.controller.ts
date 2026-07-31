import {
  BadRequestException,
  ConflictException,
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
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { BulkCreateUsersDto } from "./dto/bulk-create-users.dto";
import { CreateWorkerNoteDto } from "./dto/create-worker-note.dto";
import { CreateCertificateDto } from "./dto/create-certificate.dto";
import { UpdateCertificateDto } from "./dto/update-certificate.dto";
import { User, UserAccountStatus, UserRole } from "./schemas/user.schema";
import { UserActivityLogLevel } from "./schemas/user-activity-log.schema";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import { FilesInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { mkdirSync } from "fs";

// Ensure the upload directory exists (multer does not create it).
mkdirSync("./uploads/certificate-files", { recursive: true });

const userAvatarStorage = diskStorage({
  destination: "./uploads/user-avatars",
  filename: (_req, file, callback) => {
    const safeBaseName =
      file.originalname
        .replace(extname(file.originalname), "")
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .slice(0, 80) || "avatar";

    callback(
      null,
      `${Date.now()}-${safeBaseName}${extname(file.originalname)}`,
    );
  },
});

const userDocumentsStorage = diskStorage({
  destination: "./uploads/user-documents",
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

const certificateFilesStorage = diskStorage({
  destination: "./uploads/certificate-files",
  filename: (_req, file, callback) => {
    const safeBaseName =
      file.originalname
        .replace(extname(file.originalname), "")
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .slice(0, 80) || "certificate";

    callback(
      null,
      `${Date.now()}-${safeBaseName}${extname(file.originalname)}`,
    );
  },
});

type UploadedAvatarFile = {
  filename: string;
};

type UploadedDocumentFile = {
  filename: string;
};

@Controller("users")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  async create(
    @Body() createUserDto: CreateUserDto,
    @Request() req,
  ): Promise<User> {
    // ProjectAdmin может создавать только Worker
    if (
      req.user.role === UserRole.ProjectAdmin &&
      createUserDto.role !== UserRole.Worker
    ) {
      createUserDto.role = UserRole.Worker;
    }

    // CompanyAdmin может создавать Worker и ProjectAdmin
    if (req.user.role === UserRole.CompanyAdmin) {
      // CompanyAdmin не может создавать SuperAdmin или другого CompanyAdmin
      if (
        createUserDto.role === UserRole.SuperAdmin ||
        createUserDto.role === UserRole.CompanyAdmin
      ) {
        createUserDto.role = UserRole.Worker;
      }
    }

    // Tenant isolation: any non-superadmin ALWAYS creates users inside their own
    // company; a companyId supplied in the body is ignored (anti cross-tenant).
    if (req.user.role !== UserRole.SuperAdmin) {
      createUserDto.companyId = req.user.companyId;
    }

    const role = createUserDto.role ?? UserRole.Worker;

    // A duplicate email otherwise surfaces as a raw Mongo E11000 → 500. Check
    // up front and return a clear conflict instead.
    if (createUserDto.email) {
      const existing = await this.usersService.findByEmail(createUserDto.email);
      if (existing) {
        throw new ConflictException(
          "En användare med den e-postadressen finns redan",
        );
      }
    }

    if (createUserDto.inviteViaEmail || !createUserDto.password) {
      return this.usersService.createUserPendingApproval({
        ...createUserDto,
        role,
      });
    }

    const hashedPassword = await this.usersService.hashPassword(
      createUserDto.password,
    );

    return this.usersService.create({
      ...createUserDto,
      role,
      password: hashedPassword,
      accountStatus: UserAccountStatus.Active,
    });
  }

  @Post("bulk")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  async createBulk(
    @Body() body: BulkCreateUsersDto,
    @Request() req,
  ): Promise<{
    created: number;
    failed: Array<{ index: number; email: string; reason: string }>;
  }> {
    const failed: Array<{ index: number; email: string; reason: string }> = [];
    let created = 0;

    for (let i = 0; i < body.users.length; i += 1) {
      const row = body.users[i];
      try {
        // Same role rules as the single create endpoint.
        let role = row.role ?? UserRole.Worker;
        if (req.user.role === UserRole.ProjectAdmin) {
          role = UserRole.Worker;
        } else if (
          req.user.role === UserRole.CompanyAdmin &&
          (role === UserRole.SuperAdmin || role === UserRole.CompanyAdmin)
        ) {
          role = UserRole.Worker;
        }

        // Tenant isolation: non-superadmin always imports into its own company.
        const companyId =
          req.user.role === UserRole.SuperAdmin
            ? row.companyId
            : req.user.companyId;

        await this.usersService.createUserPendingApproval({
          ...row,
          role,
          companyId,
          inviteViaEmail: true,
        });
        created += 1;
      } catch (error) {
        const isDuplicate =
          (error as { code?: number })?.code === 11000 ||
          /duplicate key/i.test((error as Error)?.message || "");
        failed.push({
          index: i,
          email: row?.email || "",
          reason: isDuplicate
            ? "A user with this email already exists"
            : (error as Error)?.message || "Failed to create user",
        });
      }
    }

    return { created, failed };
  }

  @Get()
  @Roles(UserRole.SuperAdmin)
  findAll(@Request() req): Promise<User[]> {
    // Superadmin is a tenant too — only ever sees its own company's users,
    // never users created by other companies.
    return req.user?.companyId
      ? this.usersService.findAllByCompany(req.user.companyId)
      : this.usersService.findAll();
  }

  @Get("company/:companyId")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  findAllByCompany(
    @Param("companyId") _companyId: string,
    @Request() req,
  ): Promise<User[]> {
    // Everyone — superadmin included — only ever lists their own company; the
    // path param is never used to reach another tenant.
    if (!req.user.companyId) {
      return Promise.resolve([]);
    }
    return this.usersService.findAllByCompany(req.user.companyId);
  }

  @Get("my-company")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  findAllByMyCompany(@Request() req): Promise<User[]> {
    // Scoped to the caller's own company for every role (superadmin included).
    if (!req.user.companyId) {
      return Promise.resolve([]);
    }
    return this.usersService.findAllByCompany(req.user.companyId);
  }

  @Get("project/:projectId")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  findAllByProject(
    @Param("projectId") projectId: string,
    @Request() req,
  ): Promise<User[]> {
    // Every role (superadmin included) only sees project members from its own
    // company, so a foreign tenant's project returns nothing.
    if (!req.user.companyId) {
      return Promise.resolve([]);
    }
    return this.usersService.findAllByProject(projectId, req.user.companyId);
  }

  @Get("role/:role")
  @Roles(UserRole.SuperAdmin)
  findAllByRole(
    @Param("role") role: UserRole,
    @Request() req,
  ): Promise<User[]> {
    // Superadmin is scoped to its own company — never lists another tenant's
    // users by role.
    if (!req.user.companyId) {
      return Promise.resolve([]);
    }
    return this.usersService.findAllByRole(role, req.user.companyId);
  }

  @Get("by-email")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  findOneIdByEmail(
    @Query("email") email: string,
    @Request() req,
  ): Promise<{ id: string } | null> {
    // Every role (superadmin included) resolves emails only within its own company.
    if (!req.user.companyId) {
      return Promise.resolve(null);
    }
    return this.usersService.findOneIdByEmail(email, req.user.companyId);
  }

  @Get("info/:id")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  async findUserById(@Param("id") id: string, @Request() req) {
    await this.usersService.assertCanViewUser(req.user, id);
    const user = await this.usersService.findUserById(id);
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return user;
  }

  @Get(":id/detail")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  async findDetailedUser(@Param("id") id: string, @Request() req) {
    await this.usersService.assertCanViewUser(req.user, id);
    const detailedUser = await this.usersService.findDetailedUserById(
      id,
      req.user,
    );
    if (!detailedUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return detailedUser;
  }

  @Post("activity-log")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  async createActivityLog(
    @Request() req,
    @Body()
    body: {
      category: string;
      type: string;
      level?: UserActivityLogLevel;
      message: string;
      source?: string;
      details?: Record<string, any>;
    },
  ) {
    if (!body?.category || !body?.type || !body?.message) {
      throw new BadRequestException("category, type and message are required");
    }

    await this.usersService.logActivity(req.user.userId, {
      category: body.category,
      type: body.type,
      level: body.level,
      message: body.message,
      source: body.source,
      details: body.details,
    });

    return { created: true };
  }

  @Get(":id/activity-logs")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  async findUserActivityLogs(
    @Param("id") id: string,
    @Request() req,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("category") category?: string,
    @Query("level") level?: string,
  ) {
    await this.usersService.assertCanViewUser(req.user, id);

    return this.usersService.findActivityLogsByUserId(id, {
      page: Number(page),
      pageSize: Number(pageSize),
      category,
      level,
    });
  }

  @Get(":id/notes")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  async listWorkerNotes(@Param("id") id: string, @Request() req) {
    await this.usersService.assertCanViewUser(req.user, id);
    return this.usersService.listWorkerNotes(id);
  }

  @Post(":id/notes")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  async createWorkerNote(
    @Param("id") id: string,
    @Body() body: CreateWorkerNoteDto,
    @Request() req,
  ) {
    await this.usersService.assertCanCommentOnWorker(req.user, id);
    return this.usersService.createWorkerNote(id, req.user, body.text);
  }

  @Delete(":id/notes/:noteId")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  async deleteWorkerNote(
    @Param("id") id: string,
    @Param("noteId") noteId: string,
    @Request() req,
  ) {
    await this.usersService.assertCanCommentOnWorker(req.user, id);
    await this.usersService.removeWorkerNote(id, noteId);
    return { deleted: true };
  }

  @Post("by-ids")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  async findByIds(@Body() dto: { ids: string[] }, @Request() req) {
    // Every role (superadmin included) only resolves users from its own company.
    const users = req.user.companyId
      ? await this.usersService.findByIds(dto.ids, req.user.companyId)
      : [];
    return users.map((user) => ({
      id: (user as any)._id.toString(),
      email: user.email,
      name: user.name,
      profession: user.profession || "",
      role: user.role,
      companyId: user.companyId,
    }));
  }

  @Get(":id")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  findOne(@Param("id") id: string, @Request() req): Promise<User> {
    return this.usersService.assertCanViewUser(req.user, id).then(() => {
      return this.usersService.findOne(id);
    });
  }

  @Put(":id")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  update(
    @Param("id") id: string,
    @Body() updateUserDto: Partial<CreateUserDto>,
    @Request() req,
  ): Promise<User> {
    return this.usersService.assertCanEditUser(req.user, id).then(() => {
      return this.usersService.update(id, updateUserDto, req.user);
    });
  }

  @Post(":id/avatar")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  @UseInterceptors(FileInterceptor("avatar", { storage: userAvatarStorage }))
  uploadAvatar(
    @Param("id") id: string,
    @UploadedFile() file: UploadedAvatarFile,
    @Request() req,
  ): Promise<User> {
    return this.usersService.assertCanEditUser(req.user, id).then(() =>
      this.usersService.update(id, {
        avatarUrl: file ? `/uploads/user-avatars/${file.filename}` : "",
      }),
    );
  }

  @Post(":id/documents")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  @UseInterceptors(
    FilesInterceptor("documents", 4, { storage: userDocumentsStorage }),
  )
  uploadAdditionalDocuments(
    @Param("id") id: string,
    @UploadedFiles() files: UploadedDocumentFile[],
    @Request() req,
  ): Promise<User> {
    if (!files?.length) {
      throw new BadRequestException("No documents uploaded");
    }

    return this.usersService.assertCanEditUser(req.user, id).then(() =>
      this.usersService.appendAdditionalDocuments(
        id,
        files.map((file) => `/uploads/user-documents/${file.filename}`),
      ),
    );
  }

  // ---- Certificates (certifikat / behörigheter) ----

  @Post(":id/certificates")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  createCertificate(
    @Param("id") id: string,
    @Body() dto: CreateCertificateDto,
    @Request() req,
  ) {
    return this.usersService
      .assertCanEditUser(req.user, id)
      .then(() => this.usersService.addCertificate(id, dto));
  }

  @Put(":id/certificates/:certId")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  updateCertificate(
    @Param("id") id: string,
    @Param("certId") certId: string,
    @Body() dto: UpdateCertificateDto,
    @Request() req,
  ) {
    return this.usersService
      .assertCanEditUser(req.user, id)
      .then(() => this.usersService.updateCertificate(id, certId, dto));
  }

  @Delete(":id/certificates/:certId")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  removeCertificate(
    @Param("id") id: string,
    @Param("certId") certId: string,
    @Request() req,
  ) {
    return this.usersService
      .assertCanEditUser(req.user, id)
      .then(() => this.usersService.removeCertificate(id, certId));
  }

  @Post(":id/certificates/upload")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  @UseInterceptors(
    FileInterceptor("file", { storage: certificateFilesStorage }),
  )
  uploadCertificateFile(
    @Param("id") id: string,
    @UploadedFile() file: UploadedDocumentFile,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }
    return this.usersService.assertCanEditUser(req.user, id).then(() => ({
      fileUrl: `/uploads/certificate-files/${file.filename}`,
    }));
  }

  // Stores the file and returns its URL. OCR extraction of the certificate
  // fields is a follow-up; the frontend degrades to plain upload meanwhile.
  @Post(":id/certificates/scan")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  @UseInterceptors(
    FileInterceptor("file", { storage: certificateFilesStorage }),
  )
  scanCertificateFile(
    @Param("id") id: string,
    @UploadedFile() file: UploadedDocumentFile,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }
    return this.usersService.assertCanEditUser(req.user, id).then(() => ({
      fileUrl: `/uploads/certificate-files/${file.filename}`,
    }));
  }

  @Delete(":id")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  remove(@Param("id") id: string, @Request() req): Promise<User> {
    return this.usersService.assertCanDeleteUser(req.user, id).then(() => {
      return this.usersService.remove(id);
    });
  }
}
