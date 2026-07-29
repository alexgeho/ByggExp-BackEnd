import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel, InjectConnection } from "@nestjs/mongoose";
import { Model, Connection } from "mongoose";
import { randomBytes } from "crypto";
import * as bcrypt from "bcrypt";
import { Company, CompanyDocument } from "./schemas/company.schema";
import {
  CompanyInvite,
  CompanyInviteDocument,
} from "./schemas/company-invite.schema";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { RegisterCompanyWithAdminDto } from "./dto/register-company-with-admin.dto";
import { AcceptInviteDto } from "./dto/accept-invite.dto";
import { UsersService } from "../users/users.service";
import { MailService } from "../mail/mail.service";
import { UserAccountStatus, UserRole } from "../users/schemas/user.schema";
import {
  ModuleResolution,
  resolveModules,
  sanitizeOverrides,
} from "./modules";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(CompanyInvite.name)
    private inviteModel: Model<CompanyInviteDocument>,
    @InjectConnection() private readonly connection: Connection,
    private usersService: UsersService,
    private mailService: MailService,
  ) {}

  async create(createCompanyDto: CreateCompanyDto): Promise<CompanyDocument> {
    const createdCompany = new this.companyModel(createCompanyDto);
    return createdCompany.save();
  }

  /**
   * Superadmin onboarding: create the company only and email an invitation to the
   * company address. NO user account is created here — the invitee creates their
   * own admin account (name + password) by accepting the invite.
   */
  async createWithInvite(
    createCompanyDto: CreateCompanyDto,
  ): Promise<{ company: Company; invited: boolean }> {
    const email = createCompanyDto.email?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException("Company email is required");
    }

    const existingCompany = await this.companyModel.findOne({ email }).exec();
    if (existingCompany) {
      throw new ConflictException("Company with this email already exists");
    }

    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException("A user with this email already exists");
    }

    const company = await this.create({
      ...createCompanyDto,
      email,
      companyAdmins: [],
      projects: [],
    });

    // Pending invite — the admin User is only created on acceptance.
    const token = randomBytes(32).toString("hex");
    await this.inviteModel.create({
      companyId: company._id.toString(),
      email,
      name: createCompanyDto.name?.trim() || "",
      role: UserRole.CompanyAdmin,
      token,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });

    try {
      await this.mailService.sendCompanyInviteEmail(
        email,
        createCompanyDto.name?.trim() || "",
        token,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send company invite to ${email}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    return { company: company.toObject(), invited: true };
  }

  private async findLiveInvite(token: string): Promise<CompanyInviteDocument> {
    const invite = await this.inviteModel.findOne({ token }).exec();
    if (!invite) {
      throw new NotFoundException("Invitation not found");
    }
    if (invite.acceptedAt) {
      throw new ConflictException("Invitation already accepted");
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new GoneException("Invitation has expired");
    }
    return invite;
  }

  // Public: details for the acceptance page.
  async getInvite(token: string) {
    const invite = await this.findLiveInvite(token);
    const company = await this.companyModel.findById(invite.companyId).exec();
    return {
      email: invite.email,
      name: invite.name,
      role: invite.role,
      companyId: invite.companyId,
      companyName: company?.name || "",
    };
  }

  // Public: create the company's admin account from a valid invite.
  async acceptInvite(
    token: string,
    dto: AcceptInviteDto,
  ): Promise<{ email: string }> {
    const invite = await this.findLiveInvite(token);

    const existingUser = await this.usersService.findByEmail(invite.email);
    if (existingUser) {
      throw new ConflictException("A user with this email already exists");
    }

    const hashedPassword = await this.usersService.hashPassword(dto.password);
    const user = await this.usersService.create({
      email: invite.email,
      name: dto.name?.trim() || invite.name || invite.email,
      password: hashedPassword,
      role: UserRole.CompanyAdmin,
      companyId: invite.companyId,
      projectIds: [],
      accountStatus: UserAccountStatus.Active,
    } as never);

    await this.companyModel.findByIdAndUpdate(invite.companyId, {
      $push: { companyAdmins: user._id.toString() },
    });

    invite.acceptedAt = new Date();
    await invite.save();

    return { email: invite.email };
  }

  async registerCompanyWithAdmin(
    dto: RegisterCompanyWithAdminDto,
  ): Promise<{ company: Company; admin: any }> {
    // Проверяем существование компании
    const existingCompany = await this.companyModel
      .findOne({ email: dto.email })
      .exec();
    if (existingCompany) {
      throw new ConflictException("Company with this email already exists");
    }

    // Проверяем существование админа
    const existingAdmin = await this.usersService.findByEmail(dto.adminEmail);
    if (existingAdmin) {
      throw new ConflictException("User with this email already exists");
    }

    // Создаём компанию
    const company = await this.create({
      name: dto.name,
      address: dto.address,
      email: dto.email,
      companyAdmins: [],
      projects: [],
    });

    // Создаём CompanyAdmin
    const hashedPassword = await bcrypt.hash(dto.adminPassword, 10);
    const admin = await this.usersService.create({
      email: dto.adminEmail,
      password: hashedPassword,
      name: dto.adminName,
      phoneAreaCode: dto.adminPhoneAreaCode
        ? parseInt(dto.adminPhoneAreaCode.replace(/\D/g, "")) || 7
        : 7,
      phoneNumber: dto.adminPhoneNumber
        ? parseInt(dto.adminPhoneNumber.replace(/\D/g, ""))
        : 0,
      role: UserRole.CompanyAdmin,
      companyId: company._id.toString(),
      projectIds: [],
    });

    // Добавляем админа в список companyAdmins компании
    await this.companyModel.findByIdAndUpdate(company._id, {
      $push: { companyAdmins: admin._id.toString() },
    });

    return { company: company.toObject(), admin };
  }

  async findAll(): Promise<Company[]> {
    return this.companyModel.find().exec();
  }

  async findOne(id: string): Promise<Company> {
    const company = await this.companyModel.findById(id).exec();
    if (!company) {
      throw new NotFoundException(`Company with ID "${id}" not found`);
    }
    return company;
  }

  async findOneByEmail(email: string): Promise<Company | null> {
    return this.companyModel.findOne({ email }).exec();
  }

  // Resolve the effective module set (plan preset + overrides) for a company.
  async getModules(id: string): Promise<ModuleResolution> {
    const company = await this.companyModel
      .findById(id)
      .select("plan moduleOverrides")
      .exec();
    if (!company) {
      throw new NotFoundException(`Company with ID "${id}" not found`);
    }
    return resolveModules(company);
  }

  // Superadmin: replace the per-company override map, then return the resolution.
  async setModuleOverrides(
    id: string,
    overrides: Record<string, unknown>,
  ): Promise<ModuleResolution> {
    const clean = sanitizeOverrides(overrides);
    const company = await this.companyModel
      .findByIdAndUpdate(id, { moduleOverrides: clean }, { new: true })
      .select("plan moduleOverrides")
      .exec();
    if (!company) {
      throw new NotFoundException(`Company with ID "${id}" not found`);
    }
    return resolveModules(company);
  }

  async findByIds(ids: string[]): Promise<Company[]> {
    return this.companyModel
      .find({ _id: { $in: ids } })
      .select("name email address companyAdmins projects")
      .exec();
  }

  async findCompanyById(
    id: string,
  ): Promise<{ id: string; name: string; email: string } | null> {
    const company = await this.companyModel
      .findById(id)
      .select("name email")
      .exec();
    if (!company) return null;
    return {
      id: company._id.toString(),
      name: company.name,
      email: company.email,
    };
  }

  async addAdmin(companyId: string, userId: string): Promise<Company> {
    const company = await this.findOne(companyId);

    if (!company.companyAdmins.includes(userId)) {
      await this.companyModel.findByIdAndUpdate(companyId, {
        $push: { companyAdmins: userId },
      });
    }

    return this.findOne(companyId);
  }

  async removeAdmin(companyId: string, userId: string): Promise<Company> {
    const company = await this.findOne(companyId);

    await this.companyModel.findByIdAndUpdate(companyId, {
      $pull: { companyAdmins: userId },
    });

    return this.findOne(companyId);
  }

  async addProject(companyId: string, projectId: string): Promise<Company> {
    const company = await this.findOne(companyId);

    if (!company.projects.includes(projectId)) {
      await this.companyModel.findByIdAndUpdate(companyId, {
        $push: { projects: projectId },
      });
    }

    return this.findOne(companyId);
  }

  async update(
    id: string,
    updateCompanyDto: Partial<CreateCompanyDto>,
  ): Promise<Company> {
    const updatedCompany = await this.companyModel
      .findByIdAndUpdate(id, updateCompanyDto, { new: true })
      .exec();
    if (!updatedCompany) {
      throw new NotFoundException(`Company with ID "${id}" not found`);
    }
    return updatedCompany;
  }

  /**
   * Delete a company and cascade-delete its entire tenant footprint: every user
   * (all roles), every record scoped directly by companyId (projects, tools,
   * invoices, clients, offers, articles, worker-notes, bug-reports…), and the
   * project-scoped records that carry only a projectId (tasks, shifts, chats).
   */
  async remove(id: string): Promise<Company> {
    const company = await this.companyModel.findById(id).exec();
    if (!company) {
      throw new NotFoundException(`Company with ID "${id}" not found`);
    }
    const companyId = String(id);

    // 1) Collect this company's project ids BEFORE deleting projects, so we can
    //    cascade the records that are scoped by projectId (not companyId).
    const projectModel = this.connection.models["Project"];
    let projectIds: string[] = [];
    if (projectModel) {
      const projects = await projectModel
        .find({ companyId })
        .select("_id")
        .lean()
        .exec();
      projectIds = projects.map((p: { _id: unknown }) => String(p._id));
    }

    // 2) Delete project-scoped data (tasks, shifts, chats).
    if (projectIds.length) {
      for (const name of ["Task", "Shift", "Chat"]) {
        const model = this.connection.models[name];
        if (model && model.schema.path("projectId")) {
          await model.deleteMany({ projectId: { $in: projectIds } });
        }
      }
    }

    // 3) Delete everything scoped directly by companyId across every collection
    //    that carries a companyId (users, projects, tools, invoices, clients,
    //    offers, articles, worker-notes, bug-reports, …).
    for (const model of Object.values(this.connection.models)) {
      if (model.modelName === Company.name) continue;
      if (model.schema.path("companyId")) {
        await model.deleteMany({ companyId });
      }
    }

    // 4) Delete the company itself.
    await this.companyModel.findByIdAndDelete(id).exec();
    return company;
  }

  async findByName(name: string): Promise<CompanyDocument | null> {
    return this.companyModel.findOne({ name }).exec();
  }
}
