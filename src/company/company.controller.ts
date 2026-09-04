import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Put,
  Patch,
  Delete,
  UseGuards,
  Request,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import * as fs from "fs";
import { CompanyService } from "./company.service";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { RegisterCompanyWithAdminDto } from "./dto/register-company-with-admin.dto";
import { Company } from "./schemas/company.schema";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthGuard } from "@nestjs/passport";
import { UserRole } from "../users/schemas/user.schema";

const companyLogoStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const dir = "./uploads/company-logos";
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const base =
      (file.originalname || "logo")
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .slice(0, 60) || "logo";
    cb(null, `${base}-${Date.now()}${extname(file.originalname) || ".png"}`);
  },
});

@Controller("company")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post("register")
  @Roles(UserRole.SuperAdmin)
  async registerCompanyWithAdmin(
    @Body() dto: RegisterCompanyWithAdminDto,
  ): Promise<{ company: Company; admin: any }> {
    return this.companyService.registerCompanyWithAdmin(dto);
  }

  // Create the company only and email an invite to the company address. NO user
  // account is created here — the invitee sets up their own admin on acceptance.
  @Post()
  @Roles(UserRole.SuperAdmin)
  create(
    @Body() createCompanyDto: CreateCompanyDto,
  ): Promise<{ company: Company; invited: boolean }> {
    return this.companyService.createWithInvite(createCompanyDto);
  }

  @Get()
  @Roles(UserRole.SuperAdmin)
  findAll(): Promise<Company[]> {
    return this.companyService.findAll();
  }

  @Get("my")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  findOneByUser(@Request() req): Promise<Company> {
    if (!req.user.companyId) {
      throw new Error("User is not associated with any company");
    }
    return this.companyService.findOne(req.user.companyId);
  }

  // A non-superadmin may only ever look at their own company.
  private assertOwnCompany(
    id: string,
    req: { user: { role?: UserRole; companyId?: string | null } },
  ) {
    if (
      req.user.role !== UserRole.SuperAdmin &&
      String(req.user.companyId) !== String(id)
    ) {
      throw new ForbiddenException("You do not have access to this company");
    }
  }

  @Get("info/:id")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  async findCompanyById(@Param("id") id: string, @Request() req) {
    this.assertOwnCompany(id, req);
    const company = await this.companyService.findCompanyById(id);
    if (!company) {
      throw new NotFoundException(`Company with ID "${id}" not found`);
    }
    return company;
  }

  @Post("by-ids")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  async findByIds(@Body() dto: { ids: string[] }, @Request() req) {
    // Non-superadmin can only ever resolve their own company.
    const ids =
      req.user.role === UserRole.SuperAdmin
        ? dto.ids
        : dto.ids.filter((id) => String(id) === String(req.user.companyId));
    const companies = await this.companyService.findByIds(ids);
    return companies.map((company) => ({
      id: (company as any)._id.toString(),
      name: company.name,
      email: company.email,
      address: company.address,
    }));
  }

  @Get(":id")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  findOne(@Param("id") id: string, @Request() req): Promise<Company> {
    this.assertOwnCompany(id, req);
    return this.companyService.findOne(id);
  }

  @Put(":id")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  update(
    @Param("id") id: string,
    @Body() updateCompanyDto: Partial<CreateCompanyDto>,
    @Request() req,
  ): Promise<Company> {
    // CompanyAdmin can only edit its own company
    if (req.user.role === UserRole.CompanyAdmin && req.user.companyId !== id) {
      throw new Error("Access denied");
    }
    return this.companyService.update(id, updateCompanyDto);
  }

  @Post(":id/logo")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  @UseInterceptors(
    FileInterceptor("logo", {
      storage: companyLogoStorage,
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        cb(null, /^image\//.test(file.mimetype));
      },
    }),
  )
  async uploadLogo(
    @Param("id") id: string,
    @UploadedFile() file: { filename: string } | undefined,
    @Request() req,
  ): Promise<Company> {
    // CompanyAdmin can only touch its own company.
    if (req.user.role === UserRole.CompanyAdmin && req.user.companyId !== id) {
      throw new ForbiddenException("Access denied");
    }
    if (!file) {
      throw new BadRequestException("No image file uploaded");
    }
    return this.companyService.update(id, {
      logoUrl: `/uploads/company-logos/${file.filename}`,
    });
  }

  // Effective module set (plan preset + overrides). Company staff may read
  // their own; superadmin may read any.
  @Get(":id/modules")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  async getModules(@Param("id") id: string, @Request() req) {
    this.assertOwnCompany(id, req);
    return this.companyService.getModules(id);
  }

  // Superadmin: manually assign / clear a company's plan tier.
  @Patch(":id/plan")
  @Roles(UserRole.SuperAdmin)
  async setPlan(
    @Param("id") id: string,
    @Body() body: { plan?: string | null; maxUsers?: number | null },
  ) {
    return this.companyService.setPlan(id, body?.plan ?? null, body?.maxUsers);
  }

  // Set the per-company override map. Superadmin: any company, no limits.
  // CompanyAdmin: own company only, and may only hide/show within the plan.
  @Patch(":id/modules")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  async setModules(
    @Param("id") id: string,
    @Body() body: { overrides?: Record<string, unknown> },
    @Request() req,
  ) {
    this.assertOwnCompany(id, req);
    const restrictToPlan = req.user.role !== UserRole.SuperAdmin;
    return this.companyService.setModuleOverrides(id, body?.overrides || {}, {
      restrictToPlan,
    });
  }

  // Persist the company's onboarding checklist state (focus track + open/
  // collapsed/hidden). Company staff may update their own; superadmin any.
  @Patch(":id/onboarding")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  async setOnboarding(
    @Param("id") id: string,
    @Body() body: { focus?: string | null; view?: string },
    @Request() req,
  ) {
    this.assertOwnCompany(id, req);
    return this.companyService.setOnboarding(id, body || {});
  }

  @Delete(":id")
  @Roles(UserRole.SuperAdmin)
  remove(@Param("id") id: string): Promise<Company> {
    return this.companyService.remove(id);
  }
}
