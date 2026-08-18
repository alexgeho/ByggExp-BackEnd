import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes } from "crypto";
import {
  normalizeManagerReminderSettings,
  normalizeUserNotificationPreferences,
  User,
  UserAccountStatus,
  UserDocument,
  UserRole,
  UserWorkStatus,
} from "./schemas/user.schema";
import { MailService } from "../mail/mail.service";
import {
  ALL_PERMISSIONS,
  getEffectivePermissions,
} from "../common/permissions/permissions.constants";
import { CreateUserDto } from "./dto/create-user.dto";
import { CreateCertificateDto } from "./dto/create-certificate.dto";
import { UpdateCertificateDto } from "./dto/update-certificate.dto";
import { Company, CompanyDocument } from "../company/schemas/company.schema";
import { Project, ProjectDocument } from "../projects/schemas/project.schema";
import {
  DeviceToken,
  DeviceTokenDocument,
} from "../notifications/schemas/device-token.schema";
import {
  UserActivityLog,
  UserActivityLogDocument,
  UserActivityLogLevel,
} from "./schemas/user-activity-log.schema";
import { WorkerNote, WorkerNoteDocument } from "./schemas/worker-note.schema";
import { Tool, ToolDocument } from "../tools/schemas/tool.schema";

type UserDetailProjectRole =
  | "owner"
  | "projectManager"
  | "projectAdmin"
  | "worker";

type AuthUser = {
  userId?: string;
  role?: UserRole;
  companyId?: string | null;
};

type AccessTargetUser = {
  _id: unknown;
  role: UserRole;
  companyId?: string | null;
};

type UserActivityLogListResponse = {
  items: Array<{
    id: string;
    category: string;
    type: string;
    level: string;
    message: string;
    source: string | null;
    details: Record<string, any>;
    createdAt: Date | null;
    updatedAt: Date | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
};

type UserDetailResponse = {
  id: string;
  email: string;
  name: string;
  profession: string;
  role: string;
  avatarUrl: string;
  phoneAreaCode: number | null;
  phoneNumber: number | null;
  language: Record<string, any>;
  additionalDocuments: string[];
  certificates: unknown[];
  notificationPreferences: {
    flowMode: boolean;
    messages: boolean;
    tasks: boolean;
    productAndMarketingAlerts: boolean;
  };
  workPresence: {
    status: UserWorkStatus;
    projectId: string | null;
    projectName: string | null;
    shiftId: string | null;
    reason: string | null;
    updatedAt: Date | null;
  };
  company: {
    id: string;
    name: string;
    email: string;
    address: string;
  } | null;
  projects: Array<{
    id: string;
    name: string;
    status: string;
    location: string;
    roles: UserDetailProjectRole[];
  }>;
  tools: Array<{
    id: string;
    name: string;
    status: string;
    notes: string;
    photoUrl: string;
  }>;
  permissions: {
    canEdit: boolean;
    canDelete: boolean;
    canComment: boolean;
  };
  // Capability delegation: the user's raw overrides + the resulting effective
  // set, for the admin permissions editor ("office admin").
  capabilities: {
    overrides: { granted: string[]; revoked: string[] };
    effective: string[];
  };
  activePushTokens: Array<{
    id: string;
    installationId: string;
    expoPushToken: string;
    platform: string;
    appVersion: string | null;
    lastSeenAt: Date | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  }>;
  activityLogs: Array<{
    id: string;
    category: string;
    type: string;
    level: string;
    message: string;
    source: string | null;
    details: Record<string, any>;
    createdAt: Date | null;
    updatedAt: Date | null;
  }>;
  counts: {
    projectCount: number;
    activePushTokenCount: number;
    additionalDocumentCount: number;
    activityLogCount: number;
  };
  createdAt: Date | null;
  updatedAt: Date | null;
};

type WorkerNoteResponse = {
  id: string;
  workerId: string;
  authorUserId: string;
  authorName: string;
  authorRole: string;
  text: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectModel(Tool.name) private toolModel: Model<ToolDocument>,
    @InjectModel(DeviceToken.name)
    private deviceTokenModel: Model<DeviceTokenDocument>,
    @InjectModel(UserActivityLog.name)
    private userActivityLogModel: Model<UserActivityLogDocument>,
    @InjectModel(WorkerNote.name)
    private workerNoteModel: Model<WorkerNoteDocument>,
    private readonly mailService: MailService,
  ) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  private hashVerificationToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private buildVerificationToken(): {
    plainToken: string;
    hashedToken: string;
  } {
    const plainToken = randomBytes(32).toString("hex");

    return {
      plainToken,
      hashedToken: this.hashVerificationToken(plainToken),
    };
  }

  async create(
    createUserDto: CreateUserDto & {
      password: string;
      accountStatus?: UserAccountStatus;
    },
  ): Promise<UserDocument> {
    const createdUser = new this.userModel(
      this.normalizeCreateUserInput(createUserDto),
    );
    const savedUser = await createdUser.save();

    await this.syncUserProjectAssignments(
      savedUser._id.toString(),
      savedUser.role,
      savedUser.projectIds,
    );

    return savedUser;
  }

  private generateInvitePassword(): string {
    return randomBytes(12).toString("base64url");
  }

  private getRoleLabel(role: UserRole): string {
    const labels: Record<UserRole, string> = {
      [UserRole.SuperAdmin]: "Super Admin",
      [UserRole.CompanyAdmin]: "Company Admin",
      [UserRole.ProjectAdmin]: "Project Admin",
      [UserRole.Worker]: "Worker",
    };

    return labels[role] || "User";
  }

  private normalizeCreateUserInput(
    createUserDto: CreateUserDto & {
      password: string;
      accountStatus?: UserAccountStatus;
    },
  ) {
    return {
      ...createUserDto,
      email: createUserDto.email?.trim().toLowerCase(),
      name:
        createUserDto.name?.trim() || createUserDto.email.split("@")[0] || "",
      accountStatus: createUserDto.accountStatus ?? UserAccountStatus.Active,
      ...(createUserDto.phoneAreaCode != null
        ? { phoneAreaCode: createUserDto.phoneAreaCode }
        : {}),
      ...(createUserDto.phoneNumber != null
        ? { phoneNumber: createUserDto.phoneNumber }
        : {}),
    };
  }

  private normalizeId(value: unknown) {
    return value ? String(value) : "";
  }

  private async canProjectAdminManageWorker(
    projectAdminUserId: string,
    workerUserId: string,
  ): Promise<boolean> {
    const managedProjectsCount = await this.projectModel.countDocuments({
      projectAdmins: projectAdminUserId,
      workers: workerUserId,
    });

    return managedProjectsCount > 0;
  }

  private async canViewUser(
    actor: AuthUser,
    targetUser: AccessTargetUser,
  ): Promise<boolean> {
    const actorUserId = this.normalizeId(actor.userId);
    const targetUserId = this.normalizeId(targetUser._id);

    if (!actor.role || !actorUserId) {
      return false;
    }

    if (actorUserId === targetUserId) {
      return true;
    }

    if (actor.role === UserRole.Worker) {
      return false;
    }

    // Superadmin is scoped to its own company, exactly like a company admin —
    // it may never view a user that belongs to another tenant.
    if (
      actor.role === UserRole.CompanyAdmin ||
      actor.role === UserRole.SuperAdmin
    ) {
      return Boolean(
        actor.companyId &&
        targetUser.companyId &&
        String(actor.companyId) === String(targetUser.companyId),
      );
    }

    if (
      actor.role === UserRole.ProjectAdmin &&
      targetUser.role === UserRole.Worker
    ) {
      return this.canProjectAdminManageWorker(actorUserId, targetUserId);
    }

    return false;
  }

  private async canEditUser(
    actor: AuthUser,
    targetUser: AccessTargetUser,
  ): Promise<boolean> {
    const actorUserId = this.normalizeId(actor.userId);
    const targetUserId = this.normalizeId(targetUser._id);

    if (!actor.role || !actorUserId) {
      return false;
    }

    if (actorUserId === targetUserId) {
      return true;
    }

    // Company admin / superadmin (scoped to their own company) may manage both
    // workers and project admins — e.g. edit them or remove them from a project
    // — but not other company admins / superadmins.
    if (
      actor.role === UserRole.CompanyAdmin ||
      actor.role === UserRole.SuperAdmin
    ) {
      // A company admin manages only workers and project admins in its own
      // company — never another company admin or a superadmin. This keeps the
      // hierarchy strict: only a superadmin can create/manage company admins,
      // so admins can't quietly mint peer admins and resell access.
      if (
        targetUser.role !== UserRole.Worker &&
        targetUser.role !== UserRole.ProjectAdmin
      ) {
        return false;
      }
      return Boolean(
        actor.companyId &&
        targetUser.companyId &&
        String(actor.companyId) === String(targetUser.companyId),
      );
    }

    // Project admin can only manage workers they manage.
    if (actor.role === UserRole.ProjectAdmin) {
      if (targetUser.role !== UserRole.Worker) {
        return false;
      }
      return this.canProjectAdminManageWorker(actorUserId, targetUserId);
    }

    return false;
  }

  private async canDeleteUser(
    actor: AuthUser,
    targetUser: AccessTargetUser,
  ): Promise<boolean> {
    const actorUserId = this.normalizeId(actor.userId);
    const targetUserId = this.normalizeId(targetUser._id);

    if (!actor.role || !actorUserId || actorUserId === targetUserId) {
      return false;
    }

    // Company admin / superadmin (scoped to their own company) may delete both
    // workers and project admins, but not other company admins / superadmins.
    if (
      actor.role === UserRole.CompanyAdmin ||
      actor.role === UserRole.SuperAdmin
    ) {
      // A company admin manages only workers and project admins in its own
      // company — never another company admin or a superadmin. This keeps the
      // hierarchy strict: only a superadmin can create/manage company admins,
      // so admins can't quietly mint peer admins and resell access.
      if (
        targetUser.role !== UserRole.Worker &&
        targetUser.role !== UserRole.ProjectAdmin
      ) {
        return false;
      }
      return Boolean(
        actor.companyId &&
        targetUser.companyId &&
        String(actor.companyId) === String(targetUser.companyId),
      );
    }

    // Project admin may only delete workers they manage.
    if (actor.role === UserRole.ProjectAdmin) {
      if (targetUser.role !== UserRole.Worker) {
        return false;
      }
      return this.canProjectAdminManageWorker(actorUserId, targetUserId);
    }

    return false;
  }

  private async canCommentOnWorker(
    actor: AuthUser,
    targetUser: AccessTargetUser,
  ): Promise<boolean> {
    if (targetUser.role !== UserRole.Worker) {
      return false;
    }

    const actorUserId = this.normalizeId(actor.userId);

    if (!actor.role || !actorUserId) {
      return false;
    }

    if (actor.role === UserRole.SuperAdmin) {
      return true;
    }

    if (actor.role === UserRole.CompanyAdmin) {
      return Boolean(
        actor.companyId &&
        targetUser.companyId &&
        String(actor.companyId) === String(targetUser.companyId),
      );
    }

    if (actor.role === UserRole.ProjectAdmin) {
      return this.canProjectAdminManageWorker(
        actorUserId,
        this.normalizeId(targetUser._id),
      );
    }

    return false;
  }

  async assertCanViewUser(
    actor: AuthUser,
    targetUserId: string,
  ): Promise<UserDocument> {
    const targetUser = await this.findOne(targetUserId);

    if (!(await this.canViewUser(actor, targetUser))) {
      throw new ForbiddenException("Access denied");
    }

    return targetUser;
  }

  async assertCanEditUser(
    actor: AuthUser,
    targetUserId: string,
  ): Promise<UserDocument> {
    const targetUser = await this.findOne(targetUserId);

    if (!(await this.canEditUser(actor, targetUser))) {
      throw new ForbiddenException("Access denied");
    }

    return targetUser;
  }

  async assertCanDeleteUser(
    actor: AuthUser,
    targetUserId: string,
  ): Promise<UserDocument> {
    const targetUser = await this.findOne(targetUserId);

    if (!(await this.canDeleteUser(actor, targetUser))) {
      throw new ForbiddenException("Access denied");
    }

    return targetUser;
  }

  async assertCanCommentOnWorker(
    actor: AuthUser,
    targetUserId: string,
  ): Promise<UserDocument> {
    const targetUser = await this.findOne(targetUserId);

    if (!(await this.canCommentOnWorker(actor, targetUser))) {
      throw new ForbiddenException("Access denied");
    }

    return targetUser;
  }

  private normalizeProjectIds(projectIds?: string[]): string[] {
    return [
      ...new Set(
        (projectIds || [])
          .filter(Boolean)
          .map((projectId) => String(projectId)),
      ),
    ];
  }

  private async syncUserProjectAssignments(
    userId: string,
    role: UserRole,
    projectIds?: string[],
  ): Promise<void> {
    const normalizedUserId = String(userId);
    const normalizedProjectIds = this.normalizeProjectIds(projectIds);

    const desiredWorkerProjectIds =
      role === UserRole.Worker ? normalizedProjectIds : [];
    const desiredProjectAdminIds =
      role === UserRole.ProjectAdmin ? normalizedProjectIds : [];

    await Promise.all([
      this.projectModel.updateMany(
        { workers: normalizedUserId, _id: { $nin: desiredWorkerProjectIds } },
        { $pull: { workers: normalizedUserId } },
      ),
      this.projectModel.updateMany(
        {
          projectAdmins: normalizedUserId,
          _id: { $nin: desiredProjectAdminIds },
        },
        { $pull: { projectAdmins: normalizedUserId } },
      ),
    ]);

    if (desiredWorkerProjectIds.length) {
      await this.projectModel.updateMany(
        { _id: { $in: desiredWorkerProjectIds } },
        { $addToSet: { workers: normalizedUserId } },
      );
    }

    if (desiredProjectAdminIds.length) {
      await this.projectModel.updateMany(
        { _id: { $in: desiredProjectAdminIds } },
        { $addToSet: { projectAdmins: normalizedUserId } },
      );
    }
  }

  async createUserPendingApproval(
    createUserDto: CreateUserDto & {
      role: UserRole;
      companyId?: string | null;
    },
  ): Promise<UserDocument> {
    // Seat limit applies to every creation path — bulk import and invite go
    // through here, so enforcing it once closes the single-create bypass.
    await this.assertCompanySeatAvailable(createUserDto.companyId ?? null);
    const plainPassword = this.generateInvitePassword();
    const hashedPassword = await this.hashPassword(plainPassword);
    const { plainToken, hashedToken } = this.buildVerificationToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const createdUser = new this.userModel({
      ...this.normalizeCreateUserInput({
        ...createUserDto,
        password: hashedPassword,
        accountStatus: UserAccountStatus.WaitingForApproval,
      }),
      emailVerificationToken: hashedToken,
      emailVerificationExpiresAt: expiresAt,
    });

    let savedUser: UserDocument;
    try {
      savedUser = await createdUser.save();
    } catch (error) {
      if ((error as { code?: number })?.code === 11000) {
        throw new ConflictException(
          "En användare med den e-postadressen finns redan",
        );
      }
      throw error;
    }

    await this.syncUserProjectAssignments(
      savedUser._id.toString(),
      savedUser.role,
      savedUser.projectIds,
    );

    try {
      await this.mailService.sendUserInviteEmail(
        savedUser.email,
        savedUser.name,
        plainToken,
        plainPassword,
        this.getRoleLabel(savedUser.role),
      );
    } catch (error) {
      this.logger.error(
        `Failed to send invite email to ${savedUser.email}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    return savedUser;
  }

  // Re-send the invitation email with a fresh temporary password and
  // verification token (the previous ones may be used or expired).
  async resendInvite(userId: string): Promise<{ ok: true }> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }
    if (!this.mailService.isConfigured()) {
      throw new BadRequestException(
        "E-post är inte konfigurerad — inbjudan kunde inte skickas",
      );
    }

    const plainPassword = this.generateInvitePassword();
    user.password = await this.hashPassword(plainPassword);
    const { plainToken, hashedToken } = this.buildVerificationToken();
    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    );
    await user.save();

    await this.mailService.sendUserInviteEmail(
      user.email,
      user.name,
      plainToken,
      plainPassword,
      this.getRoleLabel(user.role),
    );

    return { ok: true };
  }

  async activateInvitedUser(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }

    if (user.accountStatus === UserAccountStatus.WaitingForApproval) {
      user.accountStatus = UserAccountStatus.Active;
      user.emailVerificationToken = null;
      user.emailVerificationExpiresAt = null;
      await user.save();
    }

    return user;
  }

  async verifyEmailByToken(token: string): Promise<{
    user: UserDocument;
    magicLoginCode: string;
  }> {
    const hashedToken = this.hashVerificationToken(token);
    const user = await this.userModel
      .findOne({
        emailVerificationToken: hashedToken,
        emailVerificationExpiresAt: { $gt: new Date() },
        accountStatus: UserAccountStatus.WaitingForApproval,
      })
      .select("+emailVerificationToken +emailVerificationExpiresAt")
      .exec();

    if (!user) {
      throw new BadRequestException("Invalid or expired verification link");
    }

    user.accountStatus = UserAccountStatus.Active;
    user.emailVerificationToken = null;
    user.emailVerificationExpiresAt = null;

    const savedUser = await user.save();
    const magicLoginCode = await this.createMagicLoginCode(
      savedUser._id.toString(),
    );

    return {
      user: savedUser,
      magicLoginCode,
    };
  }

  async createMagicLoginCode(userId: string): Promise<string> {
    const plainCode = randomBytes(32).toString("hex");
    const hashedCode = this.hashVerificationToken(plainCode);

    await this.userModel.findByIdAndUpdate(userId, {
      magicLoginCode: hashedCode,
      magicLoginExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    return plainCode;
  }

  async consumeMagicLoginCode(code: string): Promise<UserDocument> {
    const hashedCode = this.hashVerificationToken(code);
    const user = await this.userModel
      .findOne({
        magicLoginCode: hashedCode,
        magicLoginExpiresAt: { $gt: new Date() },
        accountStatus: UserAccountStatus.Active,
      })
      .select("+magicLoginCode +magicLoginExpiresAt")
      .exec();

    if (!user) {
      throw new BadRequestException("Invalid or expired sign-in link");
    }

    user.magicLoginCode = null;
    user.magicLoginExpiresAt = null;

    return user.save();
  }

  // --- Short numeric login code: the "enter the code from your email" flow the
  // mobile app uses so a user who registered without a password can sign in. ---
  async createShortLoginCode(userId: string): Promise<string> {
    // 6 digits, crypto-random and uniform over [100000, 999999].
    const plainCode = String(100000 + (randomBytes(4).readUInt32BE(0) % 900000));
    const hashedCode = this.hashVerificationToken(plainCode);
    await this.userModel.findByIdAndUpdate(userId, {
      shortLoginCode: hashedCode,
      shortLoginExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    return plainCode;
  }

  // Issue a fresh code for an existing active account (re-login). Returns null
  // when no matching account exists, so callers can respond identically and not
  // leak which emails are registered.
  async issueShortLoginCodeForEmail(
    email: string,
  ): Promise<{ user: UserDocument; code: string } | null> {
    const normalizedEmail = email?.trim().toLowerCase() || "";
    const user = await this.userModel
      .findOne({
        email: normalizedEmail,
        accountStatus: UserAccountStatus.Active,
      })
      .exec();
    if (!user) {
      return null;
    }
    const code = await this.createShortLoginCode(user._id.toString());
    return { user, code };
  }

  async consumeShortLoginCode(
    email: string,
    code: string,
  ): Promise<UserDocument> {
    const normalizedEmail = email?.trim().toLowerCase() || "";
    const hashedCode = this.hashVerificationToken(String(code || "").trim());
    const user = await this.userModel
      .findOne({
        email: normalizedEmail,
        shortLoginCode: hashedCode,
        shortLoginExpiresAt: { $gt: new Date() },
        accountStatus: UserAccountStatus.Active,
      })
      .select("+shortLoginCode +shortLoginExpiresAt")
      .exec();

    if (!user) {
      throw new BadRequestException("Invalid or expired code");
    }

    user.shortLoginCode = null;
    user.shortLoginExpiresAt = null;

    return user.save();
  }

  // Issue a password-reset token for EVERY active account sharing this email
  // (one email can back several company accounts — see findAllByEmail). The same
  // token unlocks all of them, so whichever one they had, the new password works.
  // Returns the plain token + a representative user (for the email), or null.
  async issuePasswordResetForEmail(
    email: string,
  ): Promise<{ user: UserDocument; token: string } | null> {
    const normalizedEmail = email?.trim().toLowerCase() || "";
    const users = await this.userModel
      .find({
        email: normalizedEmail,
        accountStatus: UserAccountStatus.Active,
      })
      .exec();
    if (!users.length) {
      return null;
    }
    const plainToken = randomBytes(32).toString("hex");
    const hashedToken = this.hashVerificationToken(plainToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await this.userModel.updateMany(
      { email: normalizedEmail, accountStatus: UserAccountStatus.Active },
      { passwordResetToken: hashedToken, passwordResetExpiresAt: expiresAt },
    );
    return { user: users[0], token: plainToken };
  }

  // How many active accounts a reset token currently unlocks (0 = invalid/expired).
  async countPasswordResetToken(token: string): Promise<number> {
    const hashedToken = this.hashVerificationToken(String(token || "").trim());
    return this.userModel
      .countDocuments({
        passwordResetToken: hashedToken,
        passwordResetExpiresAt: { $gt: new Date() },
        accountStatus: UserAccountStatus.Active,
      })
      .exec();
  }

  // Set an already-hashed password on every active account the reset token
  // unlocks, then clear the token. Returns the number of accounts updated.
  async applyPasswordReset(
    token: string,
    hashedPassword: string,
  ): Promise<number> {
    const hashedToken = this.hashVerificationToken(String(token || "").trim());
    const result = await this.userModel.updateMany(
      {
        passwordResetToken: hashedToken,
        passwordResetExpiresAt: { $gt: new Date() },
        accountStatus: UserAccountStatus.Active,
      },
      {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    );
    return result.modifiedCount ?? 0;
  }

  // Enforce the company's seat limit (plan/trial). No-op when the company has
  // no maxUsers set (unlimited). Counts only ACTIVE seats — GDPR-erased
  // tombstones (erasedAt set) are anonymised records, not employees, so they
  // must not consume a seat (this also keeps the count in sync with the
  // admin app's "X / N" banner, which lists erasedAt:null users).
  async assertCompanySeatAvailable(companyId: string | null): Promise<void> {
    if (!companyId) {
      return;
    }
    const company = await this.companyModel
      .findById(companyId)
      .select("maxUsers")
      .exec();
    const max = company?.maxUsers;
    if (max == null) {
      return;
    }
    const count = await this.userModel.countDocuments({
      companyId,
      erasedAt: null,
    });
    if (count >= max) {
      throw new ForbiddenException(
        `Din plan är begränsad till ${max} användare. Uppgradera för att lägga till fler.`,
      );
    }
  }

  async findAll(): Promise<User[]> {
    // erasedAt: null excludes GDPR-erased ("Raderad användare") tombstones from
    // every user-facing list; the anonymised record is kept for retained data.
    return this.userModel.find({ erasedAt: null }).exec();
  }

  async findAllByCompany(companyId: string): Promise<User[]> {
    return this.userModel.find({ companyId, erasedAt: null }).exec();
  }

  async findAllByProject(
    projectId: string,
    scopeCompanyId?: string | null,
  ): Promise<User[]> {
    const query: Record<string, unknown> = {
      projectIds: projectId,
      erasedAt: null,
    };
    if (scopeCompanyId) {
      query.companyId = scopeCompanyId;
    }
    return this.userModel.find(query).exec();
  }

  // Colleagues a user may chat with. Admins see the whole company; everyone
  // else (workers, project admins) sees co-members of their own projects.
  // Always tenant-isolated and excludes the requester.
  async findColleagues(actor: AuthUser): Promise<User[]> {
    const userId = actor?.userId;
    const companyId = actor?.companyId ?? null;
    const isAdmin =
      actor?.role === UserRole.SuperAdmin ||
      actor?.role === UserRole.CompanyAdmin;

    if (isAdmin && companyId) {
      return this.userModel
        .find({ companyId, _id: { $ne: userId }, erasedAt: null })
        .exec();
    }

    const me = await this.userModel
      .findById(userId)
      .select("projectIds companyId")
      .exec();
    if (!me) {
      return [];
    }

    const projectIds = Array.isArray(me.projectIds) ? me.projectIds : [];
    const scopeCompanyId = companyId ?? me.companyId;

    // Co-members of the user's own projects, PLUS the company's admin(s):
    // admins usually aren't assigned to projects, so workers must still be
    // able to see and message them (e.g. to reply to a message the admin
    // started). Kept tenant-isolated by the companyId filter below.
    const query: Record<string, unknown> = {
      _id: { $ne: userId },
      erasedAt: null,
      $or: [
        { projectIds: { $in: projectIds } },
        { role: UserRole.CompanyAdmin },
      ],
    };
    if (scopeCompanyId) {
      query.companyId = scopeCompanyId;
    }

    return this.userModel.find(query).exec();
  }

  async findByIds(
    ids: string[],
    scopeCompanyId?: string | null,
  ): Promise<User[]> {
    const query: Record<string, unknown> = { _id: { $in: ids } };
    if (scopeCompanyId) {
      query.companyId = scopeCompanyId;
    }
    return this.userModel
      .find(query)
      .select("email name profession role companyId projectIds")
      .exec();
  }

  async findUserById(id: string): Promise<{
    id: string;
    email: string;
    name: string;
    profession: string;
    role: string;
    avatarUrl: string;
    effectivePermissions: string[];
    notificationPreferences: {
      flowMode: boolean;
      messages: boolean;
      tasks: boolean;
      productAndMarketingAlerts: boolean;
    };
  } | null> {
    const user = await this.userModel
      .findById(id)
      .select(
        "email name profession role avatarUrl permissions notificationPreferences",
      )
      .exec();
    if (!user) return null;
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      profession: user.profession || "",
      role: user.role,
      avatarUrl: user.avatarUrl || "",
      // Effective capabilities so the client can gate features (e.g. invoicing)
      // without re-deriving the role→permission map.
      effectivePermissions: Array.from(
        getEffectivePermissions(user.role, user.permissions),
      ),
      notificationPreferences: normalizeUserNotificationPreferences(
        user.notificationPreferences,
      ),
    };
  }

  // Owner/company-admin delegates capabilities to a user (e.g. lets an office
  // secretary do invoicing) by setting per-user granted/revoked overrides.
  // Tenant-isolated: an admin can only edit users in their own company.
  async setUserPermissions(
    actor: AuthUser,
    targetId: string,
    dto: { granted?: string[]; revoked?: string[] },
  ) {
    if (
      actor.role !== UserRole.CompanyAdmin &&
      actor.role !== UserRole.SuperAdmin
    ) {
      throw new ForbiddenException("Not allowed to manage permissions.");
    }

    const target = await this.userModel.findById(targetId).exec();
    if (!target) {
      throw new NotFoundException(`User with ID "${targetId}" not found`);
    }

    if (String(target.companyId || "") !== String(actor.companyId || "")) {
      throw new ForbiddenException("User belongs to another company.");
    }

    const valid = new Set<string>(ALL_PERMISSIONS);
    const clean = (list?: string[]) => [
      ...new Set((list || []).filter((p) => valid.has(p))),
    ];

    target.permissions = {
      granted: clean(dto.granted),
      revoked: clean(dto.revoked),
    };
    await target.save();

    return {
      id: target._id.toString(),
      role: target.role,
      permissions: target.permissions,
      effectivePermissions: Array.from(
        getEffectivePermissions(target.role, target.permissions),
      ),
    };
  }

  async findDetailedUserById(
    id: string,
    actor?: AuthUser,
  ): Promise<UserDetailResponse | null> {
    const user = await this.userModel.findById(id).lean().exec();
    if (!user) {
      return null;
    }

    const companyId = user.companyId || null;
    const projectIds = Array.isArray(user.projectIds) ? user.projectIds : [];
    const normalizedUserId = this.normalizeId(user._id);
    const projectMembershipFilter = {
      $or: [
        { _id: { $in: projectIds } },
        { ownerId: normalizedUserId },
        { projectManagerId: normalizedUserId },
        { projectAdmins: normalizedUserId },
        { workers: normalizedUserId },
      ],
    };

    const [
      company,
      projects,
      tools,
      activePushTokens,
      activityLogs,
      activityLogCount,
    ] = await Promise.all([
      companyId
        ? this.companyModel
            .findById(companyId)
            .select("name email address")
            .lean()
            .exec()
        : null,
      this.projectModel
        .find(projectMembershipFilter)
        .select(
          "name status location ownerId projectManagerId projectAdmins workers",
        )
        .sort({ name: 1 })
        .lean()
        .exec(),
      this.toolModel
        .find({ workerIds: normalizedUserId })
        .select("name status notes photoUrl")
        .sort({ name: 1 })
        .lean()
        .exec(),
      this.deviceTokenModel
        .find({ userId: id, enabled: true })
        .sort({ lastSeenAt: -1, updatedAt: -1 })
        .lean()
        .exec(),
      this.userActivityLogModel
        .find({ userId: id })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()
        .exec(),
      this.userActivityLogModel.countDocuments({ userId: id }).exec(),
    ]);

    const detailedProjects = projects.map((project) => {
      const roles: UserDetailProjectRole[] = [];
      const userId = this.normalizeId(user._id);

      if (this.normalizeId(project.ownerId) === userId) {
        roles.push("owner");
      }
      if (this.normalizeId(project.projectManagerId) === userId) {
        roles.push("projectManager");
      }
      if (
        Array.isArray(project.projectAdmins) &&
        project.projectAdmins.some(
          (entry) => this.normalizeId(entry) === userId,
        )
      ) {
        roles.push("projectAdmin");
      }
      if (
        Array.isArray(project.workers) &&
        project.workers.some((entry) => this.normalizeId(entry) === userId)
      ) {
        roles.push("worker");
      }

      return {
        id: this.normalizeId(project._id),
        name: project.name,
        status: project.status,
        location: project.location || "",
        roles,
      };
    });

    const permissions =
      actor && actor.userId && actor.role
        ? {
            canEdit: await this.canEditUser(actor, user as AccessTargetUser),
            canDelete: await this.canDeleteUser(
              actor,
              user as AccessTargetUser,
            ),
            canComment: await this.canCommentOnWorker(
              actor,
              user as AccessTargetUser,
            ),
          }
        : {
            canEdit: false,
            canDelete: false,
            canComment: false,
          };

    return {
      id: this.normalizeId(user._id),
      email: user.email,
      name: user.name,
      profession: user.profession || "",
      role: user.role,
      avatarUrl: user.avatarUrl || "",
      phoneAreaCode: user.phoneAreaCode ?? null,
      phoneNumber: user.phoneNumber ?? null,
      language: user.language || {},
      additionalDocuments: Array.isArray(user.additionalDocuments)
        ? user.additionalDocuments
        : [],
      certificates: Array.isArray(user.certificates) ? user.certificates : [],
      notificationPreferences: normalizeUserNotificationPreferences(
        user.notificationPreferences,
      ),
      workPresence: {
        status: user.workStatus || UserWorkStatus.OffDuty,
        projectId: user.workStatusProjectId || null,
        projectName: user.workStatusProjectName || null,
        shiftId: user.workStatusShiftId || null,
        reason: user.workStatusReason || null,
        updatedAt: user.workStatusUpdatedAt || null,
      },
      company: company
        ? {
            id: this.normalizeId(company._id),
            name: company.name,
            email: company.email,
            address: company.address,
          }
        : null,
      projects: detailedProjects,
      tools: tools.map((tool) => ({
        id: this.normalizeId(tool._id),
        name: tool.name,
        status: tool.status,
        notes: tool.notes || "",
        photoUrl: tool.photoUrl || "",
      })),
      permissions,
      capabilities: {
        overrides: {
          granted: user.permissions?.granted || [],
          revoked: user.permissions?.revoked || [],
        },
        effective: Array.from(
          getEffectivePermissions(user.role, user.permissions),
        ),
      },
      activePushTokens: activePushTokens.map((token) => ({
        id: this.normalizeId(token._id),
        installationId: token.installationId,
        expoPushToken: token.expoPushToken,
        platform: token.platform,
        appVersion: token.appVersion || null,
        lastSeenAt: token.lastSeenAt || null,
        createdAt: (token as { createdAt?: Date }).createdAt || null,
        updatedAt: (token as { updatedAt?: Date }).updatedAt || null,
      })),
      activityLogs: activityLogs.map((log) => ({
        id: this.normalizeId(log._id),
        category: log.category,
        type: log.type,
        level: log.level,
        message: log.message,
        source: log.source || null,
        details: log.details || {},
        createdAt: (log as { createdAt?: Date }).createdAt || null,
        updatedAt: (log as { updatedAt?: Date }).updatedAt || null,
      })),
      counts: {
        projectCount: detailedProjects.length,
        activePushTokenCount: activePushTokens.length,
        additionalDocumentCount: Array.isArray(user.additionalDocuments)
          ? user.additionalDocuments.length
          : 0,
        activityLogCount,
      },
      createdAt: (user as { createdAt?: Date }).createdAt || null,
      updatedAt: (user as { updatedAt?: Date }).updatedAt || null,
    };
  }

  async logActivity(
    userId: string,
    entry: {
      category: string;
      type: string;
      level?: UserActivityLogLevel;
      message: string;
      source?: string;
      details?: Record<string, any>;
    },
  ) {
    return this.userActivityLogModel.create({
      userId,
      category: entry.category,
      type: entry.type,
      level: entry.level ?? UserActivityLogLevel.Info,
      message: entry.message,
      source: entry.source,
      details: entry.details ?? {},
    });
  }

  async findActivityLogsByUserId(
    userId: string,
    options: {
      page?: number;
      pageSize?: number;
      category?: string;
      level?: string;
    } = {},
  ): Promise<UserActivityLogListResponse> {
    const page = Math.max(1, Number(options.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 20));

    const filter: Record<string, any> = { userId };
    if (options.category) {
      filter.category = options.category;
    }
    if (options.level) {
      filter.level = options.level;
    }

    const [items, total] = await Promise.all([
      this.userActivityLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      this.userActivityLogModel.countDocuments(filter).exec(),
    ]);

    const normalizeId = (value: unknown) => (value ? String(value) : "");

    return {
      items: items.map((log) => ({
        id: normalizeId(log._id),
        category: log.category,
        type: log.type,
        level: log.level,
        message: log.message,
        source: log.source || null,
        details: log.details || {},
        createdAt: (log as { createdAt?: Date }).createdAt || null,
        updatedAt: (log as { updatedAt?: Date }).updatedAt || null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async listWorkerNotes(workerId: string): Promise<WorkerNoteResponse[]> {
    const notes = await this.workerNoteModel
      .find({ workerId })
      .sort({ createdAt: -1, updatedAt: -1 })
      .lean()
      .exec();

    return notes.map((note) => ({
      id: this.normalizeId(note._id),
      workerId: note.workerId,
      authorUserId: note.authorUserId,
      authorName: note.authorName || "",
      authorRole: note.authorRole || "",
      text: note.text,
      createdAt: (note as { createdAt?: Date }).createdAt || null,
      updatedAt: (note as { updatedAt?: Date }).updatedAt || null,
    }));
  }

  async createWorkerNote(
    workerId: string,
    actor: AuthUser,
    text: string,
  ): Promise<WorkerNoteResponse> {
    const author = actor.userId ? await this.findOne(actor.userId) : null;
    const note = await this.workerNoteModel.create({
      workerId,
      authorUserId: this.normalizeId(actor.userId),
      authorName: author?.name || author?.email || "User",
      authorRole: actor.role || "",
      companyId: actor.companyId || "",
      text: text.trim(),
    });

    return {
      id: note._id.toString(),
      workerId: note.workerId,
      authorUserId: note.authorUserId,
      authorName: note.authorName || "",
      authorRole: note.authorRole || "",
      text: note.text,
      createdAt: (note as unknown as { createdAt?: Date }).createdAt || null,
      updatedAt: (note as unknown as { updatedAt?: Date }).updatedAt || null,
    };
  }

  async removeWorkerNote(workerId: string, noteId: string): Promise<void> {
    const deletedNote = await this.workerNoteModel
      .findOneAndDelete({ _id: noteId, workerId })
      .exec();

    if (!deletedNote) {
      throw new NotFoundException(`Worker note with ID "${noteId}" not found`);
    }
  }

  async findAllByRole(role: UserRole, companyId?: string): Promise<User[]> {
    const query: Record<string, unknown> = { role, erasedAt: null };
    if (companyId) {
      query.companyId = companyId;
    }
    return this.userModel.find(query).exec();
  }

  async findOne(id: string) {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return user;
  }

  // Strip privileged fields (role / companyId / projectIds) a given actor is not
  // allowed to set, so a user cannot escalate their own role or move themselves
  // into another tenant via PUT /users/:id. `assertCanEditUser` already decided
  // WHETHER the actor may edit this target; this decides WHICH fields.
  private sanitizePrivilegedUserFields(
    dto: Partial<CreateUserDto>,
    actor: AuthUser,
    targetId: string,
  ): Partial<CreateUserDto> {
    const cleaned: Partial<CreateUserDto> = { ...dto };
    const isSuper = actor.role === UserRole.SuperAdmin;
    const isCompanyAdmin = actor.role === UserRole.CompanyAdmin;
    const editingSelf =
      !!actor.userId && String(actor.userId) === String(targetId);

    // Tenant membership: only superadmin may change companyId.
    if (!isSuper && "companyId" in cleaned) {
      delete cleaned.companyId;
    }

    // Role: superadmin → any; companyAdmin → may set worker/projectAdmin for
    // OTHER users in its company (NOT companyAdmin — only a superadmin can mint
    // company admins — never self, never superadmin); anyone else (incl. a user
    // editing self) cannot change role at all.
    if ("role" in cleaned) {
      const requested = cleaned.role;
      const companyAdminMayAssign =
        isCompanyAdmin &&
        !editingSelf &&
        (requested === UserRole.Worker ||
          requested === UserRole.ProjectAdmin);
      if (!isSuper && !companyAdminMayAssign) {
        delete cleaned.role;
      }
    }

    // Project membership is an admin-only assignment; a worker cannot add
    // themselves to arbitrary projects through self-update.
    if ("projectIds" in cleaned) {
      const mayAssignProjects =
        isSuper || isCompanyAdmin || actor.role === UserRole.ProjectAdmin;
      if (!mayAssignProjects) {
        delete cleaned.projectIds;
      }
    }

    return cleaned;
  }

  async update(
    id: string,
    updateUserDto: Partial<CreateUserDto>,
    actor?: AuthUser,
  ): Promise<User> {
    const safeDto = actor
      ? this.sanitizePrivilegedUserFields(updateUserDto, actor, id)
      : updateUserDto;

    const normalizedUpdate: Record<string, unknown> = {
      ...safeDto,
      ...(safeDto.email != null
        ? { email: safeDto.email.trim().toLowerCase() }
        : {}),
      ...(safeDto.name != null ? { name: safeDto.name.trim() } : {}),
      ...(safeDto.profession != null
        ? { profession: safeDto.profession.trim() }
        : {}),
      ...(safeDto.projectIds != null
        ? { projectIds: this.normalizeProjectIds(safeDto.projectIds) }
        : {}),
    };

    // Reminder settings: normalize and preserve the server-managed lastSentAt so
    // saving preferences never resets the send cadence.
    if (safeDto.reminderSummary) {
      const existing = await this.userModel
        .findById(id)
        .select("reminderSummary")
        .lean()
        .exec();
      normalizedUpdate.reminderSummary = normalizeManagerReminderSettings({
        ...(safeDto.reminderSummary as Record<string, unknown>),
        lastSentAt: existing?.reminderSummary?.lastSentAt ?? null,
      });
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, normalizedUpdate, { new: true })
      .exec();
    if (!updatedUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    await this.syncUserProjectAssignments(
      updatedUser._id.toString(),
      updatedUser.role,
      updatedUser.projectIds,
    );

    if (updatedUser.role !== UserRole.Worker) {
      await this.toolModel.updateMany(
        {},
        { $pull: { workerIds: updatedUser._id.toString() } },
      );
    }

    return updatedUser;
  }

  async remove(id: string): Promise<User> {
    const deletedUser = await this.userModel.findByIdAndDelete(id).exec();
    if (!deletedUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    const deletedUserId = deletedUser._id.toString();

    await Promise.all([
      this.projectModel.updateMany(
        {},
        { $pull: { workers: deletedUserId, projectAdmins: deletedUserId } },
      ),
      this.toolModel.updateMany({}, { $pull: { workerIds: deletedUserId } }),
      this.workerNoteModel.deleteMany({
        $or: [{ workerId: deletedUserId }, { authorUserId: deletedUserId }],
      }),
    ]);

    return deletedUser;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail) {
      return null;
    }

    // Exact lowercase match first, then case-insensitive for legacy records.
    const exactMatch = await this.userModel
      .findOne({ email: normalizedEmail })
      .select("+password")
      .exec();

    if (exactMatch) {
      return exactMatch;
    }

    const escapedEmail = normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    return this.userModel
      .findOne({ email: { $regex: `^${escapedEmail}$`, $options: "i" } })
      .select("+password")
      .exec();
  }

  // Email is unique per company, so one email can map to several accounts (one
  // per company). Login uses this to find every candidate and then picks the
  // account whose password matches. Passwords are included.
  async findAllByEmail(email: string): Promise<UserDocument[]> {
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail) {
      return [];
    }

    const escapedEmail = normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    return this.userModel
      .find({ email: { $regex: `^${escapedEmail}$`, $options: "i" } })
      .select("+password")
      .exec();
  }

  // Company-scoped existence check used when creating/inviting a user: the same
  // email is only a duplicate within the same company.
  async findByEmailInCompany(
    email: string,
    companyId: string | null,
  ): Promise<UserDocument | null> {
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail) {
      return null;
    }

    const escapedEmail = normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    return this.userModel
      .findOne({
        companyId: companyId ?? null,
        email: { $regex: `^${escapedEmail}$`, $options: "i" },
      })
      .exec();
  }

  async findOneIdByEmail(
    email: string,
    scopeCompanyId?: string | null,
  ): Promise<{ id: string } | null> {
    const query: Record<string, unknown> = { email };
    if (scopeCompanyId) {
      query.companyId = scopeCompanyId;
    }
    const user = await this.userModel.findOne(query).select("_id").exec();
    return user ? { id: user._id.toString() } : null;
  }

  async addUserToProject(userId: string, projectId: string): Promise<User> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }

    if (!user.projectIds.includes(projectId)) {
      user.projectIds.push(projectId);
      await user.save();
    }

    return user;
  }

  async removeUserFromProject(
    userId: string,
    projectId: string,
  ): Promise<User> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }

    user.projectIds = user.projectIds.filter((id) => id !== projectId);
    await user.save();

    return user;
  }

  async updateUserCompany(
    userId: string,
    companyId: string | null,
  ): Promise<User> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }

    user.companyId = companyId;
    await user.save();

    return user;
  }

  async updateWorkStatus(
    userId: string,
    status: UserWorkStatus,
    options: {
      projectId?: string | null;
      projectName?: string | null;
      shiftId?: string | null;
      reason?: string | null;
      updatedAt?: Date;
    } = {},
  ): Promise<User> {
    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        userId,
        {
          workStatus: status,
          workStatusProjectId: options.projectId ?? null,
          workStatusProjectName: options.projectName ?? "",
          workStatusShiftId: options.shiftId ?? null,
          workStatusReason: options.reason ?? "",
          workStatusUpdatedAt: options.updatedAt ?? new Date(),
        },
        { new: true },
      )
      .exec();

    if (!updatedUser) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }

    return updatedUser;
  }

  async setWorkingStatus(
    userId: string,
    options: {
      projectId?: string | null;
      projectName?: string | null;
      shiftId?: string | null;
      reason?: string | null;
      updatedAt?: Date;
    } = {},
  ) {
    return this.updateWorkStatus(userId, UserWorkStatus.Working, {
      ...options,
      reason: options.reason ?? "active_shift",
    });
  }

  async setOffDutyStatus(
    userId: string,
    options: {
      reason?: string | null;
      updatedAt?: Date;
    } = {},
  ) {
    return this.updateWorkStatus(userId, UserWorkStatus.OffDuty, {
      reason: options.reason ?? "shift_not_active",
      updatedAt: options.updatedAt,
    });
  }

  async setOutsideProjectAreaStatus(
    userId: string,
    options: {
      projectId?: string | null;
      projectName?: string | null;
      shiftId?: string | null;
      reason?: string | null;
      updatedAt?: Date;
    } = {},
  ) {
    return this.updateWorkStatus(userId, UserWorkStatus.OutsideProjectArea, {
      ...options,
      reason: options.reason ?? "outside_project_area",
    });
  }

  /**
   * Last device heartbeat for a worker, or null if never recorded. Used to
   * detect a shift whose phone went silent (worker left / app closed).
   */
  async getLastSeenAt(userId: string): Promise<Date | null> {
    const user = await this.userModel
      .findById(userId)
      .select("lastSeenAt")
      .lean()
      .exec();
    return user?.lastSeenAt ? new Date(user.lastSeenAt) : null;
  }

  /**
   * Records a device heartbeat (the mobile app polling while a shift is active),
   * without touching work status. Used to detect offline workers.
   */
  async touchLastSeen(userId: string, at: Date = new Date()): Promise<void> {
    await this.userModel
      .updateOne({ _id: userId }, { $set: { lastSeenAt: at } })
      .exec();
  }

  async appendAdditionalDocuments(
    id: string,
    documentUrls: string[],
  ): Promise<User> {
    const user = await this.userModel.findById(id).exec();

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    const existingDocuments = Array.isArray(user.additionalDocuments)
      ? user.additionalDocuments
      : [];

    if (existingDocuments.length + documentUrls.length > 4) {
      throw new BadRequestException(
        "You can upload up to 4 additional documents.",
      );
    }

    user.additionalDocuments = [...existingDocuments, ...documentUrls];
    await user.save();

    return user;
  }

  // ---- Certificates (certifikat / behörigheter) ----

  private buildCertificatePayload(dto: Partial<CreateCertificateDto>) {
    const out: Record<string, unknown> = {};
    if (dto.name !== undefined) out.name = dto.name;
    if (dto.number !== undefined) out.number = dto.number;
    if (dto.issuer !== undefined) out.issuer = dto.issuer;
    if (dto.issuedAt !== undefined) {
      out.issuedAt = dto.issuedAt ? new Date(dto.issuedAt) : null;
    }
    if (dto.expiresAt !== undefined) {
      out.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }
    if (dto.fileUrl !== undefined) out.fileUrl = dto.fileUrl;
    if (dto.notes !== undefined) out.notes = dto.notes;
    return out;
  }

  async addCertificate(userId: string, dto: CreateCertificateDto) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }
    const certs = user.certificates as unknown as {
      push: (value: unknown) => void;
    };
    certs.push(this.buildCertificatePayload(dto));
    await user.save();
    return user.certificates[user.certificates.length - 1];
  }

  async updateCertificate(
    userId: string,
    certId: string,
    dto: UpdateCertificateDto,
  ) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }
    const cert = (
      user.certificates as unknown as { id: (id: string) => unknown }
    ).id(certId);
    if (!cert) {
      throw new NotFoundException(`Certificate "${certId}" not found`);
    }
    Object.assign(cert, this.buildCertificatePayload(dto));
    await user.save();
    return cert;
  }

  async removeCertificate(userId: string, certId: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }
    const cert = (
      user.certificates as unknown as {
        id: (id: string) => { deleteOne: () => void } | null;
      }
    ).id(certId);
    if (!cert) {
      throw new NotFoundException(`Certificate "${certId}" not found`);
    }
    cert.deleteOne();
    await user.save();
    return { ok: true };
  }
}
