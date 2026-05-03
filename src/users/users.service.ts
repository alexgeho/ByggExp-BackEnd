import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument, UserRole } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { Company, CompanyDocument } from '../company/schemas/company.schema';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { DeviceToken, DeviceTokenDocument } from '../notifications/schemas/device-token.schema';

type UserDetailProjectRole = 'owner' | 'projectManager' | 'projectAdmin' | 'worker';

type UserDetailResponse = {
  id: string;
  email: string;
  name: string;
  profession: string;
  role: string;
  avatarUrl: string;
  phoneAreaCode: number;
  phoneNumber: number;
  language: Record<string, any>;
  additionalDocuments: string[];
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
  counts: {
    projectCount: number;
    activePushTokenCount: number;
    additionalDocumentCount: number;
  };
  createdAt: Date | null;
  updatedAt: Date | null;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectModel(DeviceToken.name) private deviceTokenModel: Model<DeviceTokenDocument>,
  ) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const createdUser = new this.userModel(createUserDto);
    return createdUser.save();
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
  ): Promise<{ id: string; email: string; name: string; profession: string; role: string; avatarUrl: string } | null> {
    const user = await this.userModel.findById(id).select('email name profession role avatarUrl').exec();
    if (!user) return null;
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      profession: user.profession || '',
      role: user.role,
      avatarUrl: user.avatarUrl || '',
    };
  }

  async findDetailedUserById(id: string): Promise<UserDetailResponse | null> {
    const user = await this.userModel.findById(id).lean().exec();
    if (!user) {
      return null;
    }

    const companyId = user.companyId || null;
    const projectIds = Array.isArray(user.projectIds) ? user.projectIds : [];

    const [company, projects, activePushTokens] = await Promise.all([
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
      phoneAreaCode: user.phoneAreaCode,
      phoneNumber: user.phoneNumber,
      language: user.language || {},
      additionalDocuments: Array.isArray(user.additionalDocuments) ? user.additionalDocuments : [],
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
      counts: {
        projectCount: detailedProjects.length,
        activePushTokenCount: activePushTokens.length,
        additionalDocumentCount: Array.isArray(user.additionalDocuments) ? user.additionalDocuments.length : 0,
      },
      createdAt: (user as { createdAt?: Date }).createdAt || null,
      updatedAt: (user as { updatedAt?: Date }).updatedAt || null,
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
    return this.userModel
      .findOne({ email })
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