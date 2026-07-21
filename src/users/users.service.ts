import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import {
  normalizeUserNotificationPreferences,
  User,
  UserAccountStatus,
  UserDocument,
  UserRole,
  UserWorkStatus,
} from './schemas/user.schema';
import { MailService } from '../mail/mail.service';
import { CreateUserDto } from './dto/create-user.dto';
import { Company, CompanyDocument } from '../company/schemas/company.schema';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { DeviceToken, DeviceTokenDocument } from '../notifications/schemas/device-token.schema';
import {
  UserActivityLog,
  UserActivityLogDocument,
  UserActivityLogLevel,
} from './schemas/user-activity-log.schema';

type UserDetailProjectRole = 'owner' | 'projectManager' | 'projectAdmin' | 'worker';

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

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectModel(DeviceToken.name) private deviceTokenModel: Model<DeviceTokenDocument>,
    @InjectModel(UserActivityLog.name)
    private userActivityLogModel: Model<UserActivityLogDocument>,
    private readonly mailService: MailService,
  ) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  private hashVerificationToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildVerificationToken(): { plainToken: string; hashedToken: string } {
    const plainToken = randomBytes(32).toString('hex');

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
    const createdUser = new this.userModel(this.normalizeCreateUserInput(createUserDto));
    return createdUser.save();
  }

  private generateInvitePassword(): string {
    return randomBytes(12).toString('base64url');
  }

  private getRoleLabel(role: UserRole): string {
    const labels: Record<UserRole, string> = {
      [UserRole.SuperAdmin]: 'Super Admin',
      [UserRole.CompanyAdmin]: 'Company Admin',
      [UserRole.ProjectAdmin]: 'Project Admin',
      [UserRole.Worker]: 'Worker',
    };

    return labels[role] || 'User';
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
      name: createUserDto.name?.trim() || createUserDto.email.split('@')[0] || '',
      accountStatus: createUserDto.accountStatus ?? UserAccountStatus.Active,
      ...(createUserDto.phoneAreaCode != null ? { phoneAreaCode: createUserDto.phoneAreaCode } : {}),
      ...(createUserDto.phoneNumber != null ? { phoneNumber: createUserDto.phoneNumber } : {}),
    };
  }

  async createUserPendingApproval(
    createUserDto: CreateUserDto & { role: UserRole; companyId?: string | null },
  ): Promise<UserDocument> {
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

    const savedUser = await createdUser.save();

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
      .select('+emailVerificationToken +emailVerificationExpiresAt')
      .exec();

    if (!user) {
      throw new BadRequestException('Invalid or expired verification link');
    }

    user.accountStatus = UserAccountStatus.Active;
    user.emailVerificationToken = null;
    user.emailVerificationExpiresAt = null;

    const savedUser = await user.save();
    const magicLoginCode = await this.createMagicLoginCode(savedUser._id.toString());

    return {
      user: savedUser,
      magicLoginCode,
    };
  }

  async createMagicLoginCode(userId: string): Promise<string> {
    const plainCode = randomBytes(32).toString('hex');
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
      .select('+magicLoginCode +magicLoginExpiresAt')
      .exec();

    if (!user) {
      throw new BadRequestException('Invalid or expired sign-in link');
    }

    user.magicLoginCode = null;
    user.magicLoginExpiresAt = null;

    return user.save();
  }

  async findAll(): Promise<User[]> {
    return this.userModel.find().exec();
  }

  async findAllByCompany(companyId: string): Promise<User[]> {
    return this.userModel.find({ companyId }).exec();
  }

  async findAllByProject(projectId: string): Promise<User[]> {
    return this.userModel.find({ projectIds: projectId }).exec();
  }

  async findByIds(ids: string[]): Promise<User[]> {
    return this.userModel.find({ _id: { $in: ids } })
      .select('email name profession role companyId projectIds')
      .exec();
  }

  async findUserById(
    id: string,
  ): Promise<{
    id: string;
    email: string;
    name: string;
    profession: string;
    role: string;
    avatarUrl: string;
    notificationPreferences: {
      flowMode: boolean;
      messages: boolean;
      tasks: boolean;
      productAndMarketingAlerts: boolean;
    };
  } | null> {
    const user = await this.userModel
      .findById(id)
      .select('email name profession role avatarUrl notificationPreferences')
      .exec();
    if (!user) return null;
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      profession: user.profession || '',
      role: user.role,
      avatarUrl: user.avatarUrl || '',
      notificationPreferences: normalizeUserNotificationPreferences(user.notificationPreferences),
    };
  }

  async findDetailedUserById(id: string): Promise<UserDetailResponse | null> {
    const user = await this.userModel.findById(id).lean().exec();
    if (!user) {
      return null;
    }

    const companyId = user.companyId || null;
    const projectIds = Array.isArray(user.projectIds) ? user.projectIds : [];

    const [company, projects, activePushTokens, activityLogs, activityLogCount] = await Promise.all([
      companyId
        ? this.companyModel.findById(companyId).select('name email address').lean().exec()
        : null,
      projectIds.length
        ? this.projectModel
            .find({ _id: { $in: projectIds } })
            .select('name status location ownerId projectManagerId projectAdmins workers')
            .sort({ name: 1 })
            .lean()
            .exec()
        : [],
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

    const normalizeId = (value: unknown) => (value ? String(value) : '');

    const detailedProjects = projects.map((project) => {
      const roles: UserDetailProjectRole[] = [];
      const userId = normalizeId(user._id);

      if (normalizeId(project.ownerId) === userId) {
        roles.push('owner');
      }
      if (normalizeId(project.projectManagerId) === userId) {
        roles.push('projectManager');
      }
      if (Array.isArray(project.projectAdmins) && project.projectAdmins.some((entry) => normalizeId(entry) === userId)) {
        roles.push('projectAdmin');
      }
      if (Array.isArray(project.workers) && project.workers.some((entry) => normalizeId(entry) === userId)) {
        roles.push('worker');
      }

      return {
        id: normalizeId(project._id),
        name: project.name,
        status: project.status,
        location: project.location || '',
        roles,
      };
    });

    return {
      id: normalizeId(user._id),
      email: user.email,
      name: user.name,
      profession: user.profession || '',
      role: user.role,
      avatarUrl: user.avatarUrl || '',
      phoneAreaCode: user.phoneAreaCode ?? null,
      phoneNumber: user.phoneNumber ?? null,
      language: user.language || {},
      additionalDocuments: Array.isArray(user.additionalDocuments) ? user.additionalDocuments : [],
      notificationPreferences: normalizeUserNotificationPreferences(user.notificationPreferences),
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
            id: normalizeId(company._id),
            name: company.name,
            email: company.email,
            address: company.address,
          }
        : null,
      projects: detailedProjects,
      activePushTokens: activePushTokens.map((token) => ({
        id: normalizeId(token._id),
        installationId: token.installationId,
        expoPushToken: token.expoPushToken,
        platform: token.platform,
        appVersion: token.appVersion || null,
        lastSeenAt: token.lastSeenAt || null,
        createdAt: (token as { createdAt?: Date }).createdAt || null,
        updatedAt: (token as { updatedAt?: Date }).updatedAt || null,
      })),
      activityLogs: activityLogs.map((log) => ({
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
      counts: {
        projectCount: detailedProjects.length,
        activePushTokenCount: activePushTokens.length,
        additionalDocumentCount: Array.isArray(user.additionalDocuments) ? user.additionalDocuments.length : 0,
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

    const normalizeId = (value: unknown) => (value ? String(value) : '');

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

  async findAllByRole(role: UserRole): Promise<User[]> {
    return this.userModel.find({ role }).exec();
  }

  async findOne(id: string) {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return user;
  }

  async update(id: string, updateUserDto: Partial<CreateUserDto>): Promise<User> {
    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .exec();
    if (!updatedUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return updatedUser;
  }

  async remove(id: string): Promise<User> {
    const deletedUser = await this.userModel.findByIdAndDelete(id).exec();
    if (!deletedUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
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
      .select('+password')
      .exec();

    if (exactMatch) {
      return exactMatch;
    }

    const escapedEmail = normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    return this.userModel
      .findOne({ email: { $regex: `^${escapedEmail}$`, $options: 'i' } })
      .select('+password')
      .exec();
  }

  async findOneIdByEmail(email: string): Promise<{ id: string } | null> {
    const user = await this.userModel.findOne({ email }).select('_id').exec();
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

  async removeUserFromProject(userId: string, projectId: string): Promise<User> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }

    user.projectIds = user.projectIds.filter((id) => id !== projectId);
    await user.save();

    return user;
  }

  async updateUserCompany(userId: string, companyId: string | null): Promise<User> {
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
          workStatusProjectName: options.projectName ?? '',
          workStatusShiftId: options.shiftId ?? null,
          workStatusReason: options.reason ?? '',
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
      reason: options.reason ?? 'active_shift',
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
      reason: options.reason ?? 'shift_not_active',
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
      reason: options.reason ?? 'outside_project_area',
    });
  }

  async appendAdditionalDocuments(id: string, documentUrls: string[]): Promise<User> {
    const user = await this.userModel.findById(id).exec();

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    const existingDocuments = Array.isArray(user.additionalDocuments)
      ? user.additionalDocuments
      : [];

    if (existingDocuments.length + documentUrls.length > 4) {
      throw new BadRequestException('You can upload up to 4 additional documents.');
    }

    user.additionalDocuments = [...existingDocuments, ...documentUrls];
    await user.save();

    return user;
  }
}