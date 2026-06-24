import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Task, TaskDocument } from './schemas/task.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { UpdateTaskDto } from './dto/update-task.dto';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { TaskRemindersService } from '../task-reminders/task-reminders.service';

type ProjectNotificationSource = {
  _id: { toString(): string };
  name: string;
  ownerId: string;
  projectManagerId: string;
  projectAdmins?: string[];
  workers?: string[];
};

type TaskNotificationSource = {
  _id: { toString(): string };
  taskTitle: string;
};

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly taskRemindersService: TaskRemindersService,
  ) {}

  async create(createTaskDto: CreateTaskDto, actorUserId?: string): Promise<Task> {
    const hasProject = Boolean(createTaskDto.projectId);
    const hasAssignee = Boolean(createTaskDto.assigneeUserId);

    if (hasProject === hasAssignee) {
      throw new BadRequestException('Task must be assigned to either a project or one user.');
    }

    if (hasAssignee) {
      return this.createPersonalTask(createTaskDto, actorUserId);
    }

    const projectId = createTaskDto.projectId as string;
    const project = await this.projectModel.findById(projectId).exec();

    if (!project) {
      throw new NotFoundException(`Project with ID "${projectId}" not found`);
    }

    const createdTask = await new this.taskModel({
      ...createTaskDto,
      createdByUserId: actorUserId || null,
    }).save();

    await this.projectModel.findByIdAndUpdate(projectId, {
      $push: { tasks: createdTask._id.toString() },
    });

    const notificationProject = this.toProjectNotificationSource(project as unknown as ProjectDocument);
    const notificationTask = this.toTaskNotificationSource(createdTask as unknown as TaskDocument);
    const projectMemberIds = this.getProjectMemberIds(project as unknown as ProjectDocument);
    await this.sendTaskCreatedNotification(notificationTask, notificationProject, actorUserId);
    await this.taskRemindersService.sendAssignmentNotification({
      actorUserId,
      notificationSettings: createTaskDto.notificationSettings,
      projectMemberIds,
      projectId,
      projectName: project.name,
      taskId: createdTask._id.toString(),
      taskTitle: createdTask.taskTitle,
    });
    await this.taskRemindersService.syncTaskReminders({
      notificationSettings: createTaskDto.notificationSettings,
      projectMemberIds,
      projectId,
      projectName: project.name,
      taskDueDate: createdTask.dueDate,
      taskId: createdTask._id.toString(),
      taskTitle: createdTask.taskTitle,
    });

    return createdTask;
  }

  private async createPersonalTask(
    createTaskDto: CreateTaskDto,
    actorUserId?: string,
  ): Promise<Task> {
    const assignee = await this.userModel.findById(createTaskDto.assigneeUserId).exec();

    if (!assignee) {
      throw new NotFoundException(`User with ID "${createTaskDto.assigneeUserId}" not found`);
    }

    const personalTaskPayload = {
      ...createTaskDto,
      projectId: null,
      assigneeUserId: assignee._id.toString(),
      assigneeUserName: assignee.name || assignee.email || 'User',
      createdByUserId: actorUserId || null,
    };
    const createdTask = await new this.taskModel(personalTaskPayload).save();
    const personalMemberIds = [assignee._id.toString()];

    await this.taskRemindersService.sendAssignmentNotification({
      actorUserId,
      notificationSettings: {
        ...createTaskDto.notificationSettings,
        assignees: [
          {
            id: assignee._id.toString(),
            name: assignee.name,
            profession: assignee.profession,
          },
        ],
      },
      projectMemberIds: personalMemberIds,
      projectId: '',
      projectName: 'Personal task',
      taskId: createdTask._id.toString(),
      taskTitle: createdTask.taskTitle,
    });
    await this.taskRemindersService.syncTaskReminders({
      notificationSettings: {
        ...createTaskDto.notificationSettings,
        assignees: [
          {
            id: assignee._id.toString(),
            name: assignee.name,
            profession: assignee.profession,
          },
        ],
      },
      projectMemberIds: personalMemberIds,
      projectId: '',
      projectName: 'Personal task',
      taskDueDate: createdTask.dueDate,
      taskId: createdTask._id.toString(),
      taskTitle: createdTask.taskTitle,
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

    const personalTaskFilter = user.userId
      ? {
          $or: [
            { assigneeUserId: user.userId },
            { createdByUserId: user.userId },
          ],
        }
      : null;
    const taskFilters = [
      ...(projectIds.length ? [{ projectId: { $in: projectIds } }] : []),
      ...(personalTaskFilter ? [personalTaskFilter] : []),
    ];

    if (!taskFilters.length) {
      return [];
    }

    return this.taskModel
      .find({ $or: taskFilters })
      .sort({ dueDate: 1, createdAt: -1 })
      .exec();
  }

  async findByProject(projectId: string): Promise<Task[]> {
    return this.taskModel
      .find({ projectId })
      .sort({ dueDate: 1, createdAt: -1 })
      .exec();
  }

  async update(id: string, updateTaskDto: UpdateTaskDto, actorUserId?: string): Promise<Task> {
    const existingTask = await this.taskModel.findById(id).exec();

    if (!existingTask) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    const currentProjectId = existingTask.projectId || null;
    const nextProjectId = updateTaskDto.projectId || currentProjectId;
    const dueDateChanged = this.hasDueDateChanged(existingTask.dueDate, updateTaskDto.dueDate);
    let targetProject = nextProjectId && nextProjectId === currentProjectId
      ? await this.projectModel.findById(currentProjectId).exec()
      : null;

    if (nextProjectId && nextProjectId !== currentProjectId) {
      targetProject = await this.projectModel.findById(nextProjectId).exec();

      if (!targetProject) {
        throw new NotFoundException(`Project with ID "${nextProjectId}" not found`);
      }

      if (currentProjectId) {
        await this.projectModel.findByIdAndUpdate(currentProjectId, {
          $pull: { tasks: existingTask._id.toString() },
        });
      }

      await this.projectModel.findByIdAndUpdate(nextProjectId, {
        $addToSet: { tasks: existingTask._id.toString() },
      });
    }

    Object.assign(existingTask, updateTaskDto, { projectId: nextProjectId });
    await existingTask.save();

    if (dueDateChanged && targetProject) {
      const notificationProject = this.toProjectNotificationSource(
        targetProject as unknown as ProjectDocument,
      );
      const notificationTask = this.toTaskNotificationSource(existingTask as unknown as TaskDocument);
      await this.sendTaskDeadlineUpdatedNotification(notificationTask, notificationProject, actorUserId);
    }

    if (targetProject) {
      const projectMemberIds = this.getProjectMemberIds(targetProject as unknown as ProjectDocument);
      await this.taskRemindersService.syncTaskReminders({
        notificationSettings: existingTask.notificationSettings,
        projectMemberIds,
        projectId: nextProjectId as string,
        projectName: targetProject.name,
        taskDueDate: existingTask.dueDate,
        taskId: existingTask._id.toString(),
        taskTitle: existingTask.taskTitle,
      });
    } else {
      await this.taskRemindersService.cancelTaskReminders(existingTask._id.toString());
    }

    return existingTask;
  }

  async remove(id: string): Promise<Task> {
    const task = await this.taskModel.findById(id).exec();

    if (!task) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    await this.taskModel.findByIdAndDelete(id).exec();
    if (task.projectId) {
      await this.projectModel.findByIdAndUpdate(task.projectId, {
        $pull: { tasks: task._id.toString() },
      });
    }
    await this.taskRemindersService.cancelTaskReminders(task._id.toString());

    return task;
  }

  private hasDueDateChanged(currentDueDate: Date, nextDueDate?: Date | string) {
    if (nextDueDate === undefined || nextDueDate === null) {
      return false;
    }

    const currentTime = currentDueDate ? new Date(currentDueDate).getTime() : null;
    const nextTime = new Date(nextDueDate).getTime();

    return currentTime !== nextTime;
  }

  private getProjectNotificationRecipients(project: ProjectNotificationSource, actorUserId?: string) {
    return [...new Set([
      project.ownerId,
      project.projectManagerId,
      ...(project.projectAdmins || []),
      ...(project.workers || []),
    ].filter((userId) => userId && userId !== actorUserId))];
  }

  private getProjectMemberIds(project: ProjectDocument) {
    return [...new Set([
      project.ownerId,
      project.projectManagerId,
      ...(project.projectAdmins || []),
      ...(project.workers || []),
    ].filter(Boolean).map((value) => value.toString()))];
  }

  private toProjectNotificationSource(project: ProjectDocument): ProjectNotificationSource {
    return {
      _id: project._id,
      name: project.name,
      ownerId: project.ownerId,
      projectManagerId: project.projectManagerId,
      projectAdmins: project.projectAdmins || [],
      workers: project.workers || [],
    };
  }

  private toTaskNotificationSource(task: TaskDocument): TaskNotificationSource {
    return {
      _id: task._id,
      taskTitle: task.taskTitle,
    };
  }

  private async sendTaskCreatedNotification(
    task: TaskNotificationSource,
    project: ProjectNotificationSource,
    actorUserId?: string,
  ) {
    const recipients = this.getProjectNotificationRecipients(project, actorUserId);
    if (!recipients.length) {
      return;
    }

    try {
      await this.notificationsService.sendToUsers(recipients, {
        title: `New task in ${project.name}`,
        body: task.taskTitle,
        preferenceKey: 'tasks',
        data: {
          type: 'task_created',
          screen: 'Project',
          projectId: project._id.toString(),
          entityId: task._id.toString(),
        },
      });
    } catch (error) {
      this.logger.error('Failed to send task created notification', error);
    }
  }

  private async sendTaskDeadlineUpdatedNotification(
    task: TaskNotificationSource,
    project: ProjectNotificationSource,
    actorUserId?: string,
  ) {
    const recipients = this.getProjectNotificationRecipients(project, actorUserId);
    if (!recipients.length) {
      return;
    }

    try {
      await this.notificationsService.sendToUsers(recipients, {
        title: `Task deadline updated in ${project.name}`,
        body: `${task.taskTitle} has a new due date.`,
        preferenceKey: 'tasks',
        data: {
          type: 'task_due_updated',
          screen: 'Project',
          projectId: project._id.toString(),
          entityId: task._id.toString(),
        },
      });
    } catch (error) {
      this.logger.error('Failed to send task deadline notification', error);
    }
  }
}