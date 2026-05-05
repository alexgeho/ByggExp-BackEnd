import { TaskReminderScheduleType } from './schemas/task-reminder.schema';

const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;
const DAY_IN_MS = 24 * HOUR_IN_MS;
const WEEK_IN_MS = 7 * DAY_IN_MS;

export type TaskNotificationAssignee = {
  id: string;
  name?: string;
  profession?: string;
};

export type TaskNotificationSettings = {
  assignees: TaskNotificationAssignee[];
  allMembersNotification: boolean;
  autoReminder: boolean;
  customReminder: boolean;
  customMessage: string;
  repeat: 'none' | 'hourly' | 'daily' | 'weekly';
};

export type TaskReminderPlan = {
  endAt: Date;
  firstRunAt: Date;
  maxRuns: number;
  scheduleType: TaskReminderScheduleType;
};

export const normalizeTaskNotificationSettings = (
  value: unknown,
): TaskNotificationSettings => {
  const source = typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {};

  const assignees = Array.isArray(source.assignees)
    ? source.assignees
        .filter((item): item is Record<string, unknown> => (
          typeof item === 'object'
          && item !== null
          && typeof item.id === 'string'
          && item.id.trim().length > 0
        ))
        .map((item) => ({
          id: item.id as string,
          name: typeof item.name === 'string' ? item.name : undefined,
          profession: typeof item.profession === 'string' ? item.profession : undefined,
        }))
    : [];

  const repeat = typeof source.repeat === 'string'
    && ['none', 'hourly', 'daily', 'weekly'].includes(source.repeat)
    ? source.repeat as TaskNotificationSettings['repeat']
    : 'none';

  return {
    assignees,
    allMembersNotification: Boolean(source.allMembersNotification),
    autoReminder: Boolean(source.autoReminder),
    customReminder: Boolean(source.customReminder),
    customMessage: typeof source.customMessage === 'string' ? source.customMessage.trim() : '',
    repeat,
  };
};

export const getReminderRecipientIds = (
  settings: TaskNotificationSettings,
  projectMemberIds: string[] = [],
) => (
  [...new Set([
    ...settings.assignees.map((assignee) => assignee.id),
    ...(settings.allMembersNotification ? projectMemberIds : []),
  ].filter(Boolean))]
);

export const hasReminderEnabled = (settings: TaskNotificationSettings) => (
  settings.autoReminder || settings.customReminder
);

export const buildAssignmentMessage = (
  taskTitle: string,
  settings: TaskNotificationSettings,
) => {
  if (settings.customReminder && settings.customMessage) {
    return settings.customMessage;
  }

  return `You were assigned to "${taskTitle}".`;
};

const getSingleReminderRunAt = (dueDate: Date, now: Date) => {
  const diffMs = dueDate.getTime() - now.getTime();

  if (diffMs <= 0) {
    return null;
  }

  if (diffMs > HOUR_IN_MS) {
    return new Date(dueDate.getTime() - HOUR_IN_MS);
  }

  return new Date(dueDate);
};

export const buildTaskReminderPlan = ({
  dueDate,
  now = new Date(),
  settings,
}: {
  dueDate: Date | string | undefined | null;
  now?: Date;
  settings: TaskNotificationSettings;
}): TaskReminderPlan | null => {
  const normalizedDueDate = dueDate ? new Date(dueDate) : null;
  if (!normalizedDueDate || Number.isNaN(normalizedDueDate.getTime())) {
    return null;
  }

  if (!hasReminderEnabled(settings)) {
    return null;
  }

  const diffMs = normalizedDueDate.getTime() - now.getTime();
  if (diffMs <= 0) {
    return null;
  }

  if (settings.repeat === 'hourly') {
    if (diffMs < HOUR_IN_MS || diffMs > DAY_IN_MS) {
      return null;
    }

    return {
      scheduleType: TaskReminderScheduleType.Hourly,
      firstRunAt: new Date(now.getTime() + HOUR_IN_MS),
      endAt: normalizedDueDate,
      maxRuns: Math.max(1, Math.min(8, Math.floor(diffMs / HOUR_IN_MS))),
    };
  }

  if (settings.repeat === 'daily') {
    if (diffMs < DAY_IN_MS || diffMs > 30 * DAY_IN_MS) {
      return null;
    }

    return {
      scheduleType: TaskReminderScheduleType.Daily,
      firstRunAt: new Date(now.getTime() + DAY_IN_MS),
      endAt: normalizedDueDate,
      maxRuns: Math.max(1, Math.min(14, Math.floor(diffMs / DAY_IN_MS))),
    };
  }

  if (settings.repeat === 'weekly') {
    if (diffMs < WEEK_IN_MS) {
      return null;
    }

    return {
      scheduleType: TaskReminderScheduleType.Weekly,
      firstRunAt: new Date(now.getTime() + WEEK_IN_MS),
      endAt: normalizedDueDate,
      maxRuns: Math.max(1, Math.min(8, Math.floor(diffMs / WEEK_IN_MS))),
    };
  }

  const firstRunAt = getSingleReminderRunAt(normalizedDueDate, now);
  if (!firstRunAt) {
    return null;
  }

  return {
    scheduleType: TaskReminderScheduleType.Once,
    firstRunAt,
    endAt: normalizedDueDate,
    maxRuns: 1,
  };
};

export const getRecurringIntervalMs = (scheduleType: TaskReminderScheduleType) => {
  if (scheduleType === TaskReminderScheduleType.Hourly) {
    return HOUR_IN_MS;
  }

  if (scheduleType === TaskReminderScheduleType.Daily) {
    return DAY_IN_MS;
  }

  if (scheduleType === TaskReminderScheduleType.Weekly) {
    return WEEK_IN_MS;
  }

  return null;
};

export const buildReminderMessage = (
  taskTitle: string,
  settings: TaskNotificationSettings,
) => {
  if (settings.customReminder && settings.customMessage) {
    return settings.customMessage;
  }

  return `Reminder: "${taskTitle}" is still waiting for attention.`;
};
