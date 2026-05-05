import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildAssignmentMessage,
  buildReminderMessage,
  buildTaskReminderPlan,
  getRecurringIntervalMs,
  getReminderRecipientIds,
  normalizeTaskNotificationSettings,
} from './task-reminder-settings';
import {
  TaskReminder,
  TaskReminderDocument,
  TaskReminderScheduleType,
  TaskReminderStatus,
} from './schemas/task-reminder.schema';

type SyncTaskReminderParams = {
  notificationSettings?: unknown;
  projectMemberIds: string[];
  projectId: string;
  projectName: string;
  taskDueDate?: Date | string | null;
  taskId: string;
  taskTitle: string;
};

type SendAssignmentNotificationParams = {
  actorUserId?: string;
  notificationSettings?: unknown;
  projectMemberIds: string[];
  projectId: string;
  projectName: string;
  taskId: string;
  taskTitle: string;
};

@Injectable()
export class TaskRemindersService {
  private readonly logger = new Logger(TaskRemindersService.name);
  private isProcessingDueReminders = false;

  constructor(
    @InjectModel(TaskReminder.name)
    private readonly taskReminderModel: Model<TaskReminderDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async sendAssignmentNotification(params: SendAssignmentNotificationParams) {
    const settings = normalizeTaskNotificationSettings(params.notificationSettings);
    const recipients = getReminderRecipientIds(settings, params.projectMemberIds)
      .filter((userId) => userId !== params.actorUserId);

    if (!recipients.length) {
      return { attempted: 0, sent: 0, disabledTokens: 0 };
    }

    return this.notificationsService.sendToUsers(recipients, {
      title: `Task assigned in ${params.projectName}`,
      body: buildAssignmentMessage(params.taskTitle, settings),
      data: {
        type: 'task_assignment',
        screen: 'Project',
        projectId: params.projectId,
        entityId: params.taskId,
      },
    });
  }

  async syncTaskReminders(params: SyncTaskReminderParams) {
    await this.cancelTaskReminders(params.taskId);

    const settings = normalizeTaskNotificationSettings(params.notificationSettings);
    const recipients = getReminderRecipientIds(settings, params.projectMemberIds);
    if (!recipients.length) {
      return { created: 0 };
    }

    const plan = buildTaskReminderPlan({
      dueDate: params.taskDueDate,
      settings,
    });

    if (!plan) {
      return { created: 0 };
    }

    const docs = recipients.map((targetUserId) => ({
      taskId: params.taskId,
      targetUserId,
      enabled: true,
      scheduleType: plan.scheduleType,
      startAt: new Date(),
      endAt: plan.endAt,
      nextRunAt: plan.firstRunAt,
      projectId: params.projectId,
      projectName: params.projectName,
      taskTitle: params.taskTitle,
      messageTitle: `Reminder for ${params.taskTitle}`,
      messageBody: buildReminderMessage(params.taskTitle, settings),
      sentCount: 0,
      maxRuns: plan.maxRuns,
      status: TaskReminderStatus.Active,
    }));

    await this.taskReminderModel.insertMany(docs);

    return { created: docs.length };
  }

  async cancelTaskReminders(taskId: string) {
    await this.taskReminderModel.deleteMany({ taskId }).exec();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processDueReminders() {
    if (this.isProcessingDueReminders) {
      return;
    }

    this.isProcessingDueReminders = true;

    try {
      const now = new Date();
      const reminders = await this.taskReminderModel.find({
        enabled: true,
        status: TaskReminderStatus.Active,
        nextRunAt: { $lte: now },
      })
        .sort({ nextRunAt: 1 })
        .limit(100)
        .exec();

      for (const reminder of reminders) {
        await this.processSingleReminder(reminder, now);
      }
    } catch (error) {
      this.logger.error('Failed to process task reminders', error);
    } finally {
      this.isProcessingDueReminders = false;
    }
  }

  private async processSingleReminder(
    reminder: TaskReminderDocument,
    now: Date,
  ) {
    try {
      await this.notificationsService.sendToUsers([reminder.targetUserId], {
        title: reminder.messageTitle || `Reminder for ${reminder.taskTitle || 'task'}`,
        body: reminder.messageBody || 'Task reminder',
        data: {
          type: 'task_reminder',
          screen: 'Project',
          projectId: reminder.projectId,
          entityId: reminder.taskId,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to send task reminder ${reminder._id.toString()}`, error);
    }

    const sentCount = (reminder.sentCount || 0) + 1;
    const nextRunAt = this.getNextRunAt(reminder, now);
    const shouldComplete = sentCount >= (reminder.maxRuns || 1)
      || !nextRunAt
      || (reminder.endAt && nextRunAt.getTime() > new Date(reminder.endAt).getTime());

    reminder.lastSentAt = now;
    reminder.sentCount = sentCount;

    if (shouldComplete) {
      reminder.status = TaskReminderStatus.Completed;
      reminder.enabled = false;
      reminder.nextRunAt = undefined;
    } else {
      reminder.nextRunAt = nextRunAt;
    }

    await reminder.save();
  }

  private getNextRunAt(reminder: TaskReminderDocument, now: Date) {
    if (reminder.scheduleType === TaskReminderScheduleType.Once) {
      return null;
    }

    const intervalMs = getRecurringIntervalMs(reminder.scheduleType);
    if (!intervalMs) {
      return null;
    }

    return new Date(now.getTime() + intervalMs);
  }
}
