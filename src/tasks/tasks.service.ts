import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Model } from "mongoose";
import { Task, TaskDocument, TaskStatus } from "./schemas/task.schema";
import { CreateTaskDto } from "./dto/create-task.dto";
import { Project, ProjectDocument } from "../projects/schemas/project.schema";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import { NotificationsService } from "../notifications/notifications.service";
import { TaskRemindersService } from "../task-reminders/task-reminders.service";
import { cronsDisabled } from "../common/cron.util";
import {
  buildReminderMessage,
  getOverdueReminderConfig,
  getReminderRecipientIds,
  hasReminderEnabled,
  normalizeTaskNotificationSettings,
} from "../task-reminders/task-reminder-settings";

type TaskAuthUser = {
  role?: UserRole;
  companyId?: string | null;
  userId?: string;
};

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
  private isProcessingOverdueReminders = false;

  constructor(
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly taskRemindersService: TaskRemindersService,
  ) {}

  async create(
    createTaskDto: CreateTaskDto,
    actor?: TaskAuthUser,
  ): Promise<Task> {
    const actorUserId = actor?.userId;
    const hasProject = Boolean(createTaskDto.projectId);
    const hasAssignee = Boolean(createTaskDto.assigneeUserId);

    if (!hasProject && !hasAssignee) {
      throw new BadRequestException(
        "Task must be assigned to a project or one user.",
      );
    }

    if (!hasProject && hasAssignee) {
      return this.createPersonalTask(createTaskDto, actor);
    }

    const projectId = createTaskDto.projectId as string;

    // Tenant isolation: the target project must belong to the caller's company
    // (and, for projectAdmin/worker, they must be a member of it).
    if (actor) {
      await this.assertProjectAccessForTasks(projectId, actor);
    }

    const project = await this.projectModel.findById(projectId).exec();

    if (!project) {
      throw new NotFoundException(`Project with ID "${projectId}" not found`);
    }

    let assigneeUserId: string | null = null;
    let assigneeUserName = "";

    if (createTaskDto.assigneeUserId) {
      const assignee = await this.userModel
        .findById(createTaskDto.assigneeUserId)
        .exec();

      if (!assignee) {
        throw new NotFoundException(
          `User with ID "${createTaskDto.assigneeUserId}" not found`,
        );
      }

      this.assertSameCompany(assignee.companyId, actor);
      assigneeUserId = assignee._id.toString();
      assigneeUserName = assignee.name || assignee.email || "User";
    }

    const createdTask = await new this.taskModel({
      ...createTaskDto,
      assigneeUserId,
      assigneeUserName,
      createdByUserId: actorUserId || null,
    }).save();

    await this.projectModel.findByIdAndUpdate(projectId, {
      $push: { tasks: createdTask._id.toString() },
    });

    const notificationProject = this.toProjectNotificationSource(
      project as unknown as ProjectDocument,
    );
    const notificationTask = this.toTaskNotificationSource(
      createdTask as unknown as TaskDocument,
    );
    const projectMemberIds = this.getProjectMemberIds(
      project as unknown as ProjectDocument,
    );
    // If the task targets a chosen subset of the team, scope the "new task"
    // ping to those assignees instead of the whole project.
    const createdSettings = normalizeTaskNotificationSettings(
      createTaskDto.notificationSettings,
    );
    const createdRecipients =
      !createdSettings.allMembersNotification && createdSettings.assignees.length
        ? getReminderRecipientIds(createdSettings, projectMemberIds)
        : undefined;
    await this.sendTaskCreatedNotification(
      notificationTask,
      notificationProject,
      actorUserId,
      createdRecipients,
    );
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
    actor?: TaskAuthUser,
  ): Promise<Task> {
    const actorUserId = actor?.userId;
    const assignee = await this.userModel
      .findById(createTaskDto.assigneeUserId)
      .exec();

    if (!assignee) {
      throw new NotFoundException(
        `User with ID "${createTaskDto.assigneeUserId}" not found`,
      );
    }

    this.assertSameCompany(assignee.companyId, actor);

    const personalTaskPayload = {
      ...createTaskDto,
      projectId: null,
      assigneeUserId: assignee._id.toString(),
      assigneeUserName: assignee.name || assignee.email || "User",
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
      projectId: "",
      projectName: "Personal task",
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
      projectId: "",
      projectName: "Personal task",
      taskDueDate: createdTask.dueDate,
      taskId: createdTask._id.toString(),
      taskTitle: createdTask.taskTitle,
    });

    return createdTask;
  }

  async findAccessible(user: {
    role: UserRole;
    companyId?: string;
    userId?: string;
  }): Promise<Task[]> {
    let projectFilter = {};

    // Superadmin is scoped to its own company like a company admin.
    if (
      (user.role === UserRole.CompanyAdmin ||
        user.role === UserRole.SuperAdmin) &&
      user.companyId
    ) {
      projectFilter = { companyId: user.companyId };
    } else if (user.role === UserRole.ProjectAdmin && user.userId) {
      projectFilter = { projectAdmins: user.userId };
    } else if (user.role === UserRole.Worker && user.userId) {
      projectFilter = { workers: user.userId };
    }

    const projects = await this.projectModel
      .find(projectFilter)
      .select("_id")
      .lean()
      .exec();
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

  // ---- Tenant / project-scope access control for single tasks ----

  // Guards that a referenced user (e.g. a task assignee) is in the caller's
  // company, so a task/notification can't be pushed to another tenant's user.
  private assertSameCompany(
    targetCompanyId: unknown,
    user?: TaskAuthUser,
  ): void {
    if (!user?.companyId) return; // internal call without a tenant context
    if (String(targetCompanyId ?? "") !== String(user.companyId)) {
      throw new ForbiddenException("User belongs to another company");
    }
  }

  private async assertProjectAccessForTasks(
    projectId: string,
    user: TaskAuthUser,
  ): Promise<void> {
    const project = await this.projectModel
      .findById(projectId)
      .select("companyId projectAdmins workers ownerId projectManagerId")
      .lean()
      .exec();
    if (!project) {
      throw new NotFoundException(`Project with ID "${projectId}" not found`);
    }
    const sameCompany =
      !!user.companyId && String(project.companyId) === String(user.companyId);
    if (!sameCompany) {
      throw new ForbiddenException("You do not have access to this project");
    }
    if (user.role === UserRole.ProjectAdmin || user.role === UserRole.Worker) {
      const uid = user.userId ? String(user.userId) : "";
      const members = [
        String((project as { ownerId?: unknown }).ownerId ?? ""),
        String(
          (project as { projectManagerId?: unknown }).projectManagerId ?? "",
        ),
        ...((project as { projectAdmins?: unknown[] }).projectAdmins ?? []).map(
          String,
        ),
        ...((project as { workers?: unknown[] }).workers ?? []).map(String),
      ];
      if (!uid || !members.includes(uid)) {
        throw new ForbiddenException("You do not have access to this project");
      }
    }
  }

  async assertTaskAccessById(
    id: string,
    user: TaskAuthUser,
  ): Promise<TaskDocument> {
    const task = await this.taskModel.findById(id).exec();
    if (!task) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }
    if (task.projectId) {
      await this.assertProjectAccessForTasks(String(task.projectId), user);
      return task;
    }

    // Personal task (no project): only its assignee/creator may touch it.
    const uid = user.userId ? String(user.userId) : "";
    const isStakeholder =
      !!uid &&
      (String((task as { assigneeUserId?: unknown }).assigneeUserId ?? "") ===
        uid ||
        String(
          (task as { createdByUserId?: unknown }).createdByUserId ?? "",
        ) === uid);
    if (!isStakeholder) {
      throw new ForbiddenException("You do not have access to this task");
    }
    return task;
  }

  async findByProject(projectId: string, user?: TaskAuthUser): Promise<Task[]> {
    if (user) {
      await this.assertProjectAccessForTasks(projectId, user);
    }
    return this.taskModel
      .find({ projectId })
      .sort({ dueDate: 1, createdAt: -1 })
      .exec();
  }

  async update(
    id: string,
    updateTaskDto: UpdateTaskDto,
    actor?: TaskAuthUser,
  ): Promise<Task> {
    const actorUserId = actor?.userId;
    const existingTask = await this.taskModel.findById(id).exec();

    if (!existingTask) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    const currentProjectId = existingTask.projectId || null;
    const nextProjectId = updateTaskDto.projectId || currentProjectId;
    const dueDateChanged = this.hasDueDateChanged(
      existingTask.dueDate,
      updateTaskDto.dueDate,
    );
    let targetProject =
      nextProjectId && nextProjectId === currentProjectId
        ? await this.projectModel.findById(currentProjectId).exec()
        : null;

    if (nextProjectId && nextProjectId !== currentProjectId) {
      // Tenant isolation: don't let a task be moved into a project of another
      // company (the caller's access to the *current* project is checked by the
      // controller's assertTaskAccessById).
      if (actor) {
        await this.assertProjectAccessForTasks(String(nextProjectId), actor);
      }

      targetProject = await this.projectModel.findById(nextProjectId).exec();

      if (!targetProject) {
        throw new NotFoundException(
          `Project with ID "${nextProjectId}" not found`,
        );
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
      const notificationTask = this.toTaskNotificationSource(
        existingTask as unknown as TaskDocument,
      );
      await this.sendTaskDeadlineUpdatedNotification(
        notificationTask,
        notificationProject,
        actorUserId,
      );
    }

    if (targetProject) {
      const projectMemberIds = this.getProjectMemberIds(
        targetProject as unknown as ProjectDocument,
      );
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
      await this.taskRemindersService.cancelTaskReminders(
        existingTask._id.toString(),
      );
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

  async complete(id: string, actorUserId?: string): Promise<Task> {
    const task = await this.taskModel.findById(id).exec();

    if (!task) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    task.status = TaskStatus.Completed;
    task.completedAt = new Date();
    task.completedByUserId = actorUserId || null;
    await task.save();
    await this.taskRemindersService.cancelTaskReminders(task._id.toString());

    return task;
  }

  async reopen(id: string, _actorUserId?: string): Promise<Task> {
    const task = await this.taskModel.findById(id).exec();

    if (!task) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    task.status = TaskStatus.Open;
    task.completedAt = null;
    task.completedByUserId = null;
    task.lastOverdueReminderAt = null;
    task.overdueReminderCount = 0;
    await task.save();

    return task;
  }

  // ---- Deadline & overdue reminders ----
  // Every minute, find not-yet-done tasks whose due date has passed. Each such
  // task gets ONE push at the deadline (the first time the cron sees it past
  // due). If `remindUntilDone` is enabled it keeps nagging every
  // `repeatIntervalMinutes` (default 15) until completed; otherwise it fires
  // just the single deadline push. Because the query re-checks `status` each
  // cycle, completing (or deleting) the task stops the reminders automatically.
  // The `$or` keeps the query cheap: repeating tasks are always matched, while
  // one-shot tasks drop out once `lastOverdueReminderAt` is stamped.
  @Cron(CronExpression.EVERY_MINUTE)
  async processOverdueReminders() {
    if (cronsDisabled() || this.isProcessingOverdueReminders) {
      return;
    }
    this.isProcessingOverdueReminders = true;

    try {
      const now = new Date();
      const tasks = await this.taskModel
        .find({
          status: { $ne: TaskStatus.Completed },
          dueDate: { $ne: null, $lte: now },
          $or: [
            { "notificationSettings.remindUntilDone": true },
            { lastOverdueReminderAt: null },
          ],
        })
        .limit(200)
        .exec();

      if (!tasks.length) {
        return;
      }

      // Resolve project members once per project for the project-scoped tasks.
      const projectIds = [
        ...new Set(
          tasks
            .map((task) => (task.projectId ? task.projectId.toString() : null))
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const projects = projectIds.length
        ? await this.projectModel.find({ _id: { $in: projectIds } }).exec()
        : [];
      const membersByProject = new Map<string, string[]>(
        projects.map((project) => [
          project._id.toString(),
          this.getProjectMemberIds(project),
        ]),
      );
      // Escalation targets per project: the boss = project manager + owner.
      const bossByProject = new Map<string, string[]>(
        projects.map((project) => [
          project._id.toString(),
          [
            ...new Set(
              [project.ownerId, project.projectManagerId]
                .filter(Boolean)
                .map((value) => String(value)),
            ),
          ],
        ]),
      );

      for (const task of tasks) {
        await this.sendOverdueReminder(
          task,
          membersByProject,
          bossByProject,
          now,
        );
      }
    } catch (error) {
      this.logger.error("Failed to process overdue task reminders", error);
    } finally {
      this.isProcessingOverdueReminders = false;
    }
  }

  private async sendOverdueReminder(
    task: TaskDocument,
    membersByProject: Map<string, string[]>,
    bossByProject: Map<string, string[]>,
    now: Date,
  ) {
    const settings = normalizeTaskNotificationSettings(
      task.notificationSettings,
    );

    // Reminders fully off for this task: stamp so we stop re-checking it every
    // minute, but never push. `remindUntilDone` counts as "on" on its own, so a
    // task can nag after the deadline without a pre-deadline reminder.
    if (!hasReminderEnabled(settings) && !settings.remindUntilDone) {
      task.lastOverdueReminderAt = now;
      await task.save();
      return;
    }

    const cfg = getOverdueReminderConfig(settings);
    const nagUntilDone = cfg.enabled;
    const last = task.lastOverdueReminderAt
      ? new Date(task.lastOverdueReminderAt).getTime()
      : null;

    if (nagUntilDone) {
      // Keep nagging: throttle to one push per interval.
      if (
        last !== null &&
        now.getTime() - last < cfg.intervalMinutes * 60 * 1000
      ) {
        return;
      }
    } else if (last !== null) {
      // One-shot deadline push already sent.
      return;
    }

    const projectMemberIds = task.projectId
      ? membersByProject.get(task.projectId.toString()) || []
      : task.assigneeUserId
        ? [task.assigneeUserId.toString()]
        : [];
    const workerRecipients = getReminderRecipientIds(settings, projectMemberIds);

    // Escalation: after `maxReminders` pushes to the assignee, switch to the
    // boss (project manager / owner, or an explicit list). maxReminders 0 or no
    // escalation configured keeps nagging the assignee forever.
    const count = task.overdueReminderCount || 0;
    const workerExhausted =
      nagUntilDone && cfg.maxReminders > 0 && count >= cfg.maxReminders;

    let recipients: string[];
    let escalated = false;
    if (workerExhausted && cfg.escalateToBoss) {
      recipients = this.resolveBossRecipients(task, cfg, bossByProject);
      escalated = true;
    } else if (workerExhausted) {
      // Assignee reminder cap reached and no escalation → stop nagging.
      recipients = [];
    } else {
      recipients = workerRecipients;
    }

    if (recipients.length) {
      try {
        await this.notificationsService.sendToUsers(recipients, {
          title: escalated
            ? `Escalated (overdue): ${task.taskTitle}`
            : `Overdue: ${task.taskTitle}`,
          body: escalated
            ? `${task.assigneeUserName || "A worker"} still hasn't completed "${task.taskTitle}".`
            : buildReminderMessage(task.taskTitle, settings),
          preferenceKey: "tasks",
          data: {
            type: escalated ? "task_escalated" : "task_overdue",
            screen: task.projectId ? "Project" : "Tasks",
            ...(task.projectId
              ? { projectId: task.projectId.toString() }
              : {}),
            entityId: task._id.toString(),
          },
        });
        // Only assignee reminders count toward the escalation threshold.
        if (!escalated) {
          task.overdueReminderCount = count + 1;
        }
      } catch (error) {
        this.logger.error(
          `Failed to send overdue reminder for task ${task._id.toString()}`,
          error,
        );
      }
    }

    // Stamp regardless so we respect the interval even when there are no
    // recipients (avoids re-checking the same task every minute).
    task.lastOverdueReminderAt = now;
    await task.save();
  }

  private resolveBossRecipients(
    task: TaskDocument,
    cfg: { escalateToUserIds: string[] },
    bossByProject: Map<string, string[]>,
  ): string[] {
    if (cfg.escalateToUserIds.length) {
      return cfg.escalateToUserIds;
    }
    if (task.projectId) {
      return bossByProject.get(task.projectId.toString()) || [];
    }
    // Personal task → escalate to whoever created it.
    return task.createdByUserId ? [task.createdByUserId.toString()] : [];
  }

  private hasDueDateChanged(
    currentDueDate: Date | null | undefined,
    nextDueDate?: Date | string,
  ) {
    if (nextDueDate === undefined || nextDueDate === null) {
      return false;
    }

    const currentTime = currentDueDate
      ? new Date(currentDueDate).getTime()
      : null;
    const nextTime = new Date(nextDueDate).getTime();

    return currentTime !== nextTime;
  }

  private getProjectNotificationRecipients(
    project: ProjectNotificationSource,
    actorUserId?: string,
  ) {
    return [
      ...new Set(
        [
          project.ownerId,
          project.projectManagerId,
          ...(project.projectAdmins || []),
          ...(project.workers || []),
        ].filter((userId) => userId && userId !== actorUserId),
      ),
    ];
  }

  private getProjectMemberIds(project: ProjectDocument) {
    return [
      ...new Set(
        [
          project.ownerId,
          project.projectManagerId,
          ...(project.projectAdmins || []),
          ...(project.workers || []),
        ]
          .filter(Boolean)
          .map((value) => value.toString()),
      ),
    ];
  }

  private toProjectNotificationSource(
    project: ProjectDocument,
  ): ProjectNotificationSource {
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
    explicitRecipients?: string[],
  ) {
    // When the task is assigned to a chosen subset, only ping those users;
    // otherwise notify the whole project team.
    const recipients = (
      explicitRecipients ??
      this.getProjectNotificationRecipients(project, actorUserId)
    ).filter((userId) => userId && userId !== actorUserId);
    if (!recipients.length) {
      return;
    }

    try {
      await this.notificationsService.sendToUsers(recipients, {
        title: `New task in ${project.name}`,
        body: task.taskTitle,
        preferenceKey: "tasks",
        data: {
          type: "task_created",
          screen: "Project",
          projectId: project._id.toString(),
          entityId: task._id.toString(),
        },
      });
    } catch (error) {
      this.logger.error("Failed to send task created notification", error);
    }
  }

  private async sendTaskDeadlineUpdatedNotification(
    task: TaskNotificationSource,
    project: ProjectNotificationSource,
    actorUserId?: string,
  ) {
    const recipients = this.getProjectNotificationRecipients(
      project,
      actorUserId,
    );
    if (!recipients.length) {
      return;
    }

    try {
      await this.notificationsService.sendToUsers(recipients, {
        title: `Task deadline updated in ${project.name}`,
        body: `${task.taskTitle} has a new due date.`,
        preferenceKey: "tasks",
        data: {
          type: "task_due_updated",
          screen: "Project",
          projectId: project._id.toString(),
          entityId: task._id.toString(),
        },
      });
    } catch (error) {
      this.logger.error("Failed to send task deadline notification", error);
    }
  }
}
