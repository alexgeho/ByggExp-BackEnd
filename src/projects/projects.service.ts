import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Project, ProjectDocument } from './schemas/project.schema';
import { CreateProjectDto } from './dto/create-project.dto';
import { UsersService } from '../users/users.service';
import { CompanyService } from '../company/company.service';
import { UserRole } from '../users/schemas/user.schema';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    private usersService: UsersService,
    private companyService: CompanyService,
  ) {}

  async create(createProjectDto: CreateProjectDto): Promise<Project> {
    const createdProject = new this.projectModel(createProjectDto);
    const project = await createdProject.save();

    await this.companyService.addProject(createProjectDto.companyId, project._id.toString());
    await this.usersService.addUserToProject(createProjectDto.projectManagerId, project._id.toString());

    if (createProjectDto.projectAdmins) {
      for (const adminId of createProjectDto.projectAdmins) {
        await this.usersService.addUserToProject(adminId, project._id.toString());
      }
    }

    return project;
  }

  async findAll(): Promise<Project[]> {
    return this.projectModel.find().exec();
  }

  async findAllByCompany(companyId: string): Promise<Project[]> {
    return this.projectModel.find({ companyId }).exec();
  }

  async findAllByUser(userId: string): Promise<Project[]> {
    return this.projectModel.find({
      $or: [
        { ownerId: userId },
        { projectManagerId: userId },
        { projectAdmins: userId },
        { workers: userId },
      ],
    }).exec();
  }

  async findByIds(ids: string[]): Promise<Project[]> {
    return this.projectModel.find({ _id: { $in: ids } })
      .select('companyId ownerId projectManagerId name status location')
      .exec();
  }

  async findProjectById(id: string): Promise<{ id: string; name: string; status: string; companyId: string } | null> {
    const project = await this.projectModel.findById(id).select('name status companyId').exec();
    if (!project) return null;
    return {
      id: project._id.toString(),
      name: project.name,
      status: project.status,
      companyId: project.companyId,
    };
  }

  async findOne(id: string): Promise<Project> {
    const project = await this.projectModel.findById(id).exec();
    if (!project) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }
    return project;
  }

  async findOneWithPopulated(id: string): Promise<Project> {
    const project = await this.projectModel
      .findById(id)
      .populate('ownerId', 'name email role')
      .populate('projectManagerId', 'name email role')
      .populate('companyId', 'name email')
      .populate('projectAdmins', 'name email role')
      .populate('workers', 'name email role')
      .populate('tasks', 'taskTitle taskDescription startDate dueDate documents')
      .exec();
    if (!project) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }
    return project;
  }

  async addWorkers(projectId: string, workerIds: string[]): Promise<Project> {
    const project = await this.findOne(projectId);

    for (const workerId of workerIds) {
      const user = await this.usersService.findOne(workerId);
      if (user.role !== UserRole.Worker) {
        throw new ForbiddenException(`User ${workerId} is not a Worker`);
      }

      if (!project.workers.includes(workerId)) {
        await this.projectModel.findByIdAndUpdate(projectId, {
          $push: { workers: workerId },
        });
      }

      await this.usersService.addUserToProject(workerId, projectId);
    }

    return this.findOneWithPopulated(projectId);
  }

  async removeWorker(projectId: string, workerId: string): Promise<Project> {
    await this.projectModel.findByIdAndUpdate(projectId, {
      $pull: { workers: workerId },
    });

    await this.usersService.removeUserFromProject(workerId, projectId);

    return this.findOneWithPopulated(projectId);
  }

  async addProjectAdmin(projectId: string, userId: string): Promise<Project> {
    const project = await this.findOne(projectId);

    if (!project.projectAdmins.includes(userId)) {
      await this.projectModel.findByIdAndUpdate(projectId, {
        $push: { projectAdmins: userId },
      });
    }

    await this.usersService.addUserToProject(userId, projectId);

    return this.findOneWithPopulated(projectId);
  }

  async update(id: string, updateProjectDto: Partial<CreateProjectDto>): Promise<Project> {
    const updatedProject = await this.projectModel
      .findByIdAndUpdate(id, updateProjectDto, { new: true })
      .exec();
    if (!updatedProject) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }
    return updatedProject;
  }

  async remove(id: string): Promise<Project> {
    const deletedProject = await this.projectModel.findByIdAndDelete(id).exec();
    if (!deletedProject) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }
    return deletedProject;
  }

  async findAllPopulated() {
    return this.projectModel
      .find()
      .populate({
        path: 'ownerId',
        select: 'name email role',
      })
      .populate({
        path: 'projectManagerId',
        select: 'name email role',
      })
      .populate({
        path: 'companyId',
        select: 'name email',
      })
      .populate({
        path: 'projectAdmins',
        select: 'name email role',
      })
      .populate({
        path: 'workers',
        select: 'name email role',
      })
      .lean();
  }
}