import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Task, TaskDocument } from './schemas/task.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UserRole } from '../users/schemas/user.schema';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    const project = await this.projectModel.findById(createTaskDto.projectId).exec();

    if (!project) {
      throw new NotFoundException(`Project with ID "${createTaskDto.projectId}" not found`);
    }

    const createdTask = await new this.taskModel(createTaskDto).save();

    await this.projectModel.findByIdAndUpdate(createTaskDto.projectId, {
      $push: { tasks: createdTask._id.toString() },
    });

    return createdTask;
  }

  async findAccessible(user: { role: UserRole; companyId?: string; userId?: string }): Promise<Task[]> {
    if (user.role === UserRole.SuperAdmin) {
      return this.taskModel
        .find()
        .sort({ dueDate: 1, createdAt: -1 })
        .exec();
    }

    let projectFilter = {};

    if (user.role === UserRole.CompanyAdmin && user.companyId) {
      projectFilter = { companyId: user.companyId };
    } else if (user.role === UserRole.ProjectAdmin && user.userId) {
      projectFilter = { projectAdmins: user.userId };
    } else if (user.role === UserRole.Worker && user.userId) {
      projectFilter = { workers: user.userId };
    }

    const projects = await this.projectModel.find(projectFilter).select('_id').lean().exec();
    const projectIds = projects.map((project) => project._id.toString());

    if (!projectIds.length) {
      return [];
    }

    return this.taskModel
      .find({ projectId: { $in: projectIds } })
      .sort({ dueDate: 1, createdAt: -1 })
      .exec();
  }

  async findByProject(projectId: string): Promise<Task[]> {
    return this.taskModel
      .find({ projectId })
      .sort({ dueDate: 1, createdAt: -1 })
      .exec();
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    const existingTask = await this.taskModel.findById(id).exec();

    if (!existingTask) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    const nextProjectId = updateTaskDto.projectId || existingTask.projectId;

    if (nextProjectId !== existingTask.projectId) {
      const targetProject = await this.projectModel.findById(nextProjectId).exec();

      if (!targetProject) {
        throw new NotFoundException(`Project with ID "${nextProjectId}" not found`);
      }

      await this.projectModel.findByIdAndUpdate(existingTask.projectId, {
        $pull: { tasks: existingTask._id.toString() },
      });

      await this.projectModel.findByIdAndUpdate(nextProjectId, {
        $addToSet: { tasks: existingTask._id.toString() },
      });
    }

    Object.assign(existingTask, updateTaskDto, { projectId: nextProjectId });
    await existingTask.save();

    return existingTask;
  }

  async remove(id: string): Promise<Task> {
    const task = await this.taskModel.findById(id).exec();

    if (!task) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    await this.taskModel.findByIdAndDelete(id).exec();
    await this.projectModel.findByIdAndUpdate(task.projectId, {
      $pull: { tasks: task._id.toString() },
    });

    return task;
  }
}