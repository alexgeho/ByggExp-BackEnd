import { TaskReminderScheduleType } from "./schemas/task-reminder.schema";
import {
  DEFAULT_REPEAT_INTERVAL_MINUTES,
  MAX_HOURLY_REPEAT_RUNS,
  MAX_MINUTE_REPEAT_RUNS,
  MAX_REPEAT_INTERVAL_MINUTES,
  MIN_REPEAT_INTERVAL_MINUTES,
} from "./task-reminder.settings";

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
  repeat: "none" | "minutes" | "hourly" | "daily" | "weekly";
  repeatIntervalMinutes: number;
  // When true, keep pushing a reminder every `repeatIntervalMinutes` AFTER the
  // due date passes, until the task is marked done. Independent of `repeat`
  // (which only fires before the due date).
  remindUntilDone: boolean;
  // How many overdue reminders go to the assignee before escalating. 0 = never
  // stop nagging the assignee (no escalation cut-off).
  maxReminders: number;
  // After `maxReminders` reminders, also start reminding the boss.
  escalateToBoss: boolean;
  // Explicit escalation recipients; empty = resolve to the project manager /
  // owner (or the task creator for a personal task).
  escalateToUserIds: string[];
};

export type TaskReminderPlan = {
  endAt: Date;
  firstRunAt: Date;
  intervalMinutes?: number;
  maxRuns: number;
  scheduleType: TaskReminderScheduleType;
};

export const normalizeTaskNotificationSettings = (
  value: unknown,
): TaskNotificationSettings => {
  const source =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};

  const assignees = Array.isArray(source.assignees)
    ? source.assignees
        .filter(
          (item): item is Record<string, unknown> =>
            typeof item === "object" &&
            item !== null &&
            typeof item.id === "string" &&
            item.id.trim().length > 0,
        )
        .map((item) => ({
          id: item.id as string,
          name: typeof item.name === "string" ? item.name : undefined,
          profession:
            typeof item.profession === "string" ? item.profession : undefined,
        }))
    : [];

  const repeat =
    typeof source.repeat === "string" &&
    ["none", "minutes", "hourly", "daily", "weekly"].includes(source.repeat)
      ? (source.repeat as TaskNotificationSettings["repeat"])
      : "none";

  const parsedIntervalMinutes = Number(source.repeatIntervalMinutes);
  const repeatIntervalMinutes = Number.isFinite(parsedIntervalMinutes)
    ? Math.min(
        MAX_REPEAT_INTERVAL_MINUTES,
        Math.max(
          MIN_REPEAT_INTERVAL_MINUTES,
          Math.round(parsedIntervalMinutes),
        ),
      )
    : DEFAULT_REPEAT_INTERVAL_MINUTES;

  return {
    assignees,
    allMembersNotification: Boolean(source.allMembersNotification),
    autoReminder: Boolean(source.autoReminder),
    customReminder: Boolean(source.customReminder),
    customMessage:
      typeof source.customMessage === "string"
        ? source.customMessage.trim()
        : "",
    repeat,
    repeatIntervalMinutes,
    remindUntilDone: Boolean(source.remindUntilDone),
    maxReminders: (() => {
      const n = Number(source.maxReminders);
      return Number.isFinite(n) && n > 0 ? Math.min(100, Math.floor(n)) : 0;
    })(),
    escalateToBoss: Boolean(source.escalateToBoss),
    escalateToUserIds: Array.isArray(source.escalateToUserIds)
      ? [
          ...new Set(
            source.escalateToUserIds
              .filter(
                (id): id is string => typeof id === "string" && !!id.trim(),
              )
              .map((id) => id.trim()),
          ),
        ]
      : [],
  };
};

// Resolves whether the "nag after the deadline until done" behaviour is active
// for a task, how often it fires, and the escalation policy (nag the assignee
// `maxReminders` times, then optionally the boss). 0 maxReminders = no cut-off.
export const getOverdueReminderConfig = (
  settings: TaskNotificationSettings,
): {
  enabled: boolean;
  intervalMinutes: number;
  maxReminders: number;
  escalateToBoss: boolean;
  escalateToUserIds: string[];
} => ({
  enabled: settings.remindUntilDone,
  intervalMinutes: Math.max(1, settings.repeatIntervalMinutes),
  maxReminders: settings.maxReminders,
  escalateToBoss: settings.escalateToBoss,
  escalateToUserIds: settings.escalateToUserIds,
});

export const getReminderRecipientIds = (
  settings: TaskNotificationSettings,
  projectMemberIds: string[] = [],
) => [
  ...new Set(
    [
      ...settings.assignees.map((assignee) => assignee.id),
      ...(settings.allMembersNotification ? projectMemberIds : []),
    ].filter(Boolean),
  ),
];

export const hasReminderEnabled = (settings: TaskNotificationSettings) =>
  settings.autoReminder || settings.customReminder;

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

  if (settings.repeat === "minutes") {
    const intervalMs = settings.repeatIntervalMinutes * MINUTE_IN_MS;

    if (diffMs < intervalMs) {
      return null;
    }

    const maxRuns = Math.max(
      1,
      Math.min(MAX_MINUTE_REPEAT_RUNS, Math.floor(diffMs / intervalMs)),
    );

    return {
      scheduleType: TaskReminderScheduleType.Minutes,
      firstRunAt: new Date(now.getTime() + intervalMs),
      endAt: normalizedDueDate,
      intervalMinutes: settings.repeatIntervalMinutes,
      maxRuns,
    };
  }

  if (settings.repeat === "hourly") {
    if (diffMs < HOUR_IN_MS) {
      return null;
    }

    const maxRuns = Math.max(
      1,
      Math.min(MAX_HOURLY_REPEAT_RUNS, Math.floor(diffMs / HOUR_IN_MS)),
    );

    return {
      scheduleType: TaskReminderScheduleType.Hourly,
      firstRunAt: new Date(now.getTime() + HOUR_IN_MS),
      endAt: normalizedDueDate,
      maxRuns,
    };
  }

  if (settings.repeat === "daily") {
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

  if (settings.repeat === "weekly") {
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

export const getRecurringIntervalMs = (
  scheduleType: TaskReminderScheduleType,
  intervalMinutes = DEFAULT_REPEAT_INTERVAL_MINUTES,
) => {
  if (scheduleType === TaskReminderScheduleType.Minutes) {
    return intervalMinutes * MINUTE_IN_MS;
  }

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

// Push notifications go out in the recipient's chosen app language (Swedish or
// English). The user's `language` field is a { code: label } object (e.g.
// { sv: "Svenska" }); we read the code and fall back to English otherwise.
export type NotificationLang = "en" | "sv";

export const resolveNotificationLang = (language: unknown): NotificationLang => {
  if (language && typeof language === "object") {
    const code = Object.keys(language as Record<string, unknown>)[0]
      ?.slice(0, 2)
      .toLowerCase();
    if (code === "sv") {
      return "sv";
    }
  }
  return "en";
};

// Localized title/body for the overdue "confirm completion" reminders. The first
// push (at the deadline) asks the assignee to confirm the task is done; every
// repeat nags until it is marked complete. Escalation notifies the boss.
export const buildOverdueReminderContent = ({
  taskTitle,
  isFirst,
  lang,
  escalated,
  workerName,
  settings,
}: {
  taskTitle: string;
  isFirst: boolean;
  lang: NotificationLang;
  escalated: boolean;
  workerName?: string;
  settings: TaskNotificationSettings;
}): { title: string; body: string } => {
  const t = taskTitle;

  if (escalated) {
    const worker =
      workerName || { en: "A worker", sv: "En medarbetare" }[lang];
    return {
      title: {
        en: `Reminder: ${t}`,
        sv: `Påminnelse: ${t}`,
      }[lang],
      body: {
        en: `${worker} still hasn't completed "${t}".`,
        sv: `${worker} har fortfarande inte slutfört "${t}".`,
      }[lang],
    };
  }

  const title = isFirst
    ? { en: `Task due: ${t}`, sv: `Dags för uppgift: ${t}` }[lang]
    : { en: `Reminder: ${t}`, sv: `Påminnelse: ${t}` }[lang];

  if (settings.customReminder && settings.customMessage) {
    return { title, body: settings.customMessage };
  }

  const body = isFirst
    ? {
        en: `It's time for "${t}". If you've finished, confirm it as done — otherwise please complete it now.`,
        sv: `Det är dags för "${t}". Om du är klar, bekräfta att den är slutförd — annars slutför den nu.`,
      }[lang]
    : {
        en: `"${t}" still needs to be completed. Mark it done to confirm and stop the reminders.`,
        sv: `"${t}" måste fortfarande slutföras. Markera den som klar för att bekräfta och stoppa påminnelserna.`,
      }[lang];

  return { title, body };
};
