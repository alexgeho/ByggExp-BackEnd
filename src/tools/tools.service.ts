import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tool, ToolDocument } from './schemas/tool.schema';
import { CreateToolDto } from './dto/create-tool.dto';
import { UpdateToolDto } from './dto/update-tool.dto';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { UserRole } from '../users/schemas/user.schema';

type AuthUser = {
  role: UserRole;
  companyId?: string;
  userId?: string;
};

@Injectable()
export class ToolsService {
  constructor(
    @InjectModel(Tool.name) private toolModel: Model<ToolDocument>,
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
  ) {}

  async create(
    createToolDto: CreateToolDto,
    user?: AuthUser,
  ): Promise<Tool> {
    const payload: CreateToolDto = {
      ...createToolDto,
      workerIds: createToolDto.workerIds || [],
      projectIds: createToolDto.projectIds || [],
    };

    if (user?.role === UserRole.CompanyAdmin && user.companyId) {
      payload.companyId = user.companyId;
    }

    return new this.toolModel(payload).save();
  }

  async findAccessible(user: AuthUser): Promise<Tool[]> {
    if (user.role === UserRole.SuperAdmin) {
      return this.toolModel.find().sort({ createdAt: -1 }).exec();
    }

    if (user.role === UserRole.CompanyAdmin && user.companyId) {
      const companyProjects = await this.projectModel
        .find({ companyId: user.companyId })
        .select('_id')
        .lean()
        .exec();
      const projectIds = companyProjects.map((project) => project._id.toString());

      return this.toolModel
        .find({
          $or: [
            { companyId: user.companyId },
            { projectIds: { $in: projectIds } },
          ],
        })
        .sort({ createdAt: -1 })
        .exec();
    }

    const projectFilter = this.getProjectFilterForUser(user);
    const projects = await this.projectModel.find(projectFilter).select('_id').lean().exec();
    const projectIds = projects.map((project) => project._id.toString());

    if (!projectIds.length && user.role !== UserRole.Worker) {
      return [];
    }

    const accessFilter: Record<string, unknown>[] = [];

    if (projectIds.length) {
      accessFilter.push({ projectIds: { $in: projectIds } });
    }

    if (user.role === UserRole.Worker && user.userId) {
      accessFilter.push({ workerIds: user.userId });
    }

    if (!accessFilter.length) {
      return [];
    }

    return this.toolModel
      .find({ $or: accessFilter })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<Tool> {
    const tool = await this.toolModel.findById(id).exec();

    if (!tool) {
      throw new NotFoundException(`Tool with ID "${id}" not found`);
    }

    return tool;
  }

  async update(id: string, updateToolDto: UpdateToolDto): Promise<Tool> {
    const tool = await this.toolModel.findById(id).exec();

    if (!tool) {
      throw new NotFoundException(`Tool with ID "${id}" not found`);
    }

    Object.assign(tool, updateToolDto);
    await tool.save();

    return tool;
  }

  async remove(id: string): Promise<Tool> {
    const tool = await this.toolModel.findById(id).exec();

    if (!tool) {
      throw new NotFoundException(`Tool with ID "${id}" not found`);
    }

    await this.toolModel.findByIdAndDelete(id).exec();

    return tool;
  }

  async attachToWorker(workerId: string, toolIds: string[]): Promise<void> {
    if (!toolIds.length) {
      return;
    }

    await this.toolModel.updateMany(
      { _id: { $in: toolIds } },
      { $addToSet: { workerIds: workerId } },
    );
  }

  async attachToProject(projectId: string, toolIds: string[]): Promise<void> {
    if (!toolIds.length) {
      return;
    }

    await this.toolModel.updateMany(
      { _id: { $in: toolIds } },
      { $addToSet: { projectIds: projectId } },
    );
  }

  private getProjectFilterForUser(user: AuthUser) {
    if (user.role === UserRole.ProjectAdmin && user.userId) {
      return { projectAdmins: user.userId };
    }

    if (user.role === UserRole.Worker && user.userId) {
      return { workers: user.userId };
    }

    return {};
  }
}
