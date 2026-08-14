import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { cronsDisabled } from "../common/cron.util";
import { NotificationsService } from "../notifications/notifications.service";
import { getScheduledShiftDeadline } from "../shifts/shift-schedule.util";
import { Project, ProjectDocument } from "../projects/schemas/project.schema";
import { Shift, ShiftDocument } from "../shifts/schemas/shift.schema";
import { UserRole } from "../users/schemas/user.schema";
import {
  Company,
  CompanyDocument,
  HoursReminderRule,
} from "../company/schemas/company.schema";
import {
  HoursReminderState,
  HoursReminderStateDocument,
  HoursReminderStatus,
} from "./schemas/hours-reminder-state.schema";

const TZ = "Europe/Stockholm";

type NudgeParams = {
  companyId?: string;
  role?: string;
  userIds?: string[];
  projectId?: string;
  onlyMissing?: boolean;
};

export type NudgeResult = {
  targeted: number;
  reminded: number;
  attempted: number;
  sent: number;
};

const DEFAULT_RULE: HoursReminderRule = {
  enabled: false,
  startDelayMinutes: 15,
  intervalMinutes: 15,
  maxReminders: 0,
  escalateAfterReminders: 3,
  workingWeekdays: [1, 2, 3, 4, 5],
};

@Injectable()
export class HoursRemindersService {
  private readonly logger = new Logger(HoursRemindersService.name);
  private isRunning = false;

  constructor(
    @InjectModel(Project.name)
    private readonly projectModel: Model<ProjectDocument>,
    @InjectModel(Shift.name)
    private readonly shiftModel: Model<ShiftDocument>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(HoursReminderState.name)
    private readonly stateModel: Model<HoursReminderStateDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Same day key format the shifts write to Shift.shiftDate (server-local).
  private getDateKey(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  // ISO weekday (1=Mon…7=Sun) in the reminder timezone.
  private weekdayOf(now: Date): number {
    const dayKey = now.toLocaleDateString("en-CA", { timeZone: TZ });
    const dow = new Date(`${dayKey}T00:00:00Z`).getUTCDay(); // 0=Sun
    return ((dow + 6) % 7) + 1;
  }

  private normalizeRule(
    rule?: Partial<HoursReminderRule> | null,
  ): HoursReminderRule {
    return { ...DEFAULT_RULE, ...(rule || {}) };
  }

  // ---- One-off nudge (admin buttons on the project Team tab) ----

  private async remind(
    targetIds: string[],
    opts: {
      onlyMissing?: boolean;
      projectId?: string;
      projectName?: string;
    } = {},
  ): Promise<NudgeResult> {
    const uniqueTargets = [...new Set(targetIds.map((id) => String(id)))];
    const empty: NudgeResult = {
      targeted: uniqueTargets.length,
      reminded: 0,
      attempted: 0,
      sent: 0,
    };

    if (!uniqueTargets.length) {
      return empty;
    }

    const today = this.getDateKey(new Date());
    let remindIds = uniqueTargets;

    if (opts.onlyMissing) {
      // "Missing" = no shift at all today (GPS or manual) — skip GPS reporters.
      const loggedShifts = await this.shiftModel
        .find({ workerId: { $in: uniqueTargets }, shiftDate: today })
        .select("workerId")
        .lean()
        .exec();

      const loggedSet = new Set(
        loggedShifts.map((shift) => String(shift.workerId)),
      );
      remindIds = uniqueTargets.filter((id) => !loggedSet.has(id));
    }

    if (!remindIds.length) {
      return empty;
    }

    const result = await this.notificationsService.sendToUsers(remindIds, {
      title: "Log your hours",
      body: opts.projectName
        ? `Please report how many hours you worked today on ${opts.projectName}.`
        : "Please report how many hours you worked today.",
      data: {
        type: "hours_reminder",
        screen: "Shifts",
        date: today,
        ...(opts.projectId ? { projectId: opts.projectId } : {}),
      },
    });

    return {
      targeted: uniqueTargets.length,
      reminded: remindIds.length,
      attempted: result.attempted,
      sent: result.sent,
    };
  }

  async nudge(params: NudgeParams): Promise<NudgeResult> {
    const { companyId, role, userIds, projectId, onlyMissing } = params;

    let project: {
      companyId?: string;
      name?: string;
      workers?: string[];
    } | null = null;
    if (projectId) {
      project = await this.projectModel
        .findById(projectId)
        .select("companyId name workers")
        .lean<{ companyId?: string; name?: string; workers?: string[] }>()
        .exec();
      if (!project) {
        throw new NotFoundException("Project not found");
      }
      if (
        role !== UserRole.SuperAdmin &&
        companyId &&
        String(project.companyId) !== String(companyId)
      ) {
        throw new ForbiddenException("Project belongs to another company");
      }
    }

    let targetIds: string[] = [];
    if (userIds?.length) {
      targetIds = userIds.map((id) => String(id));
    } else if (project) {
      targetIds = (project.workers || []).map((id) => String(id));
    } else {
      throw new BadRequestException("Provide userIds or projectId");
    }

    return this.remind(targetIds, {
      onlyMissing,
      projectId,
      projectName: project?.name,
    });
  }

  // ---- Rule config (company-wide, shift-anchored) ----

  async getRule(companyId?: string): Promise<HoursReminderRule> {
    if (!companyId) {
      throw new BadRequestException("No company in context");
    }
    const company = await this.companyModel
      .findById(companyId)
      .select("hoursReminderRule")
      .lean<{ hoursReminderRule?: HoursReminderRule }>()
      .exec();
    if (!company) {
      throw new NotFoundException("Company not found");
    }
    return this.normalizeRule(company.hoursReminderRule);
  }

  async updateRule(
    companyId: string | undefined,
    patch: Partial<HoursReminderRule>,
  ): Promise<HoursReminderRule> {
    if (!companyId) {
      throw new BadRequestException("No company in context");
    }
    const current = await this.getRule(companyId);
    const next = this.normalizeRule({ ...current, ...patch });

    await this.companyModel
      .updateOne({ _id: companyId }, { $set: { hoursReminderRule: next } })
      .exec();

    return next;
  }

  // ---- Shift-anchored cron ----

  // A worker has "reported" for the day if ANY shift exists for them that day —
  // whether GPS-tracked (clock-in) or a manual entry. So GPS reporters are never
  // nagged, and a manual submit stops the reminder on the next tick.
  private async hasReportedHours(
    workerId: string,
    date: string,
  ): Promise<boolean> {
    const shift = await this.shiftModel
      .exists({ workerId, shiftDate: date })
      .exec();
    return Boolean(shift);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async processHoursReminders(): Promise<void> {
    if (cronsDisabled() || this.isRunning) {
      return;
    }
    this.isRunning = true;
    try {
      const now = new Date();
      const today = this.getDateKey(now);
      const weekday = this.weekdayOf(now);

      // Close states left over from previous days that never resolved.
      await this.stateModel
        .updateMany(
          { status: HoursReminderStatus.Active, date: { $lt: today } },
          { $set: { status: HoursReminderStatus.Stopped } },
        )
        .exec();

      const companies = await this.companyModel
        .find({ "hoursReminderRule.enabled": true })
        .select("_id hoursReminderRule")
        .lean<Array<{ _id: unknown; hoursReminderRule?: HoursReminderRule }>>()
        .exec();

      const ruleByCompany = new Map<string, HoursReminderRule>();
      for (const company of companies) {
        ruleByCompany.set(
          String(company._id),
          this.normalizeRule(company.hoursReminderRule),
        );
      }

      await this.seedDueStates(companies, ruleByCompany, now, today, weekday);
      await this.fireDueStates(ruleByCompany, now, today);
    } catch (error) {
      this.logger.error("Failed to process hours reminders", error);
    } finally {
      this.isRunning = false;
    }
  }

  // Create a reminder state per worker who owes hours once the scheduled shift
  // end (+ start delay) has passed for a project today.
  private async seedDueStates(
    companies: Array<{ _id: unknown }>,
    ruleByCompany: Map<string, HoursReminderRule>,
    now: Date,
    today: string,
    weekday: number,
  ): Promise<void> {
    for (const company of companies) {
      const companyId = String(company._id);
      const rule = ruleByCompany.get(companyId);
      if (!rule || !rule.workingWeekdays?.includes(weekday)) {
        continue;
      }

      const projects = await this.projectModel
        .find({ companyId, "shiftSchedule.enabled": true })
        .select("_id workers shiftSchedule")
        .lean<
          Array<{ _id: unknown; workers?: string[]; shiftSchedule?: unknown }>
        >()
        .exec();

      for (const project of projects) {
        const projectId = String(project._id);
        const deadline = getScheduledShiftDeadline(
          project.shiftSchedule as never,
          today,
        );
        if (!deadline) {
          continue;
        }
        const startAt = deadline.getTime() + rule.startDelayMinutes * 60_000;
        if (now.getTime() < startAt) {
          continue;
        }

        const workerIds = (project.workers || []).map((id) => String(id));
        if (!workerIds.length) {
          continue;
        }

        // Any shift today (GPS clock-in OR manual entry, any project) means the
        // worker is already reporting — don't seed a reminder for them.
        const loggedShifts = await this.shiftModel
          .find({ workerId: { $in: workerIds }, shiftDate: today })
          .select("workerId")
          .lean()
          .exec();
        const loggedSet = new Set(
          loggedShifts.map((shift) => String(shift.workerId)),
        );

        const existing = await this.stateModel
          .find({ projectId, date: today })
          .select("workerId")
          .lean()
          .exec();
        const existingSet = new Set(
          existing.map((state) => String(state.workerId)),
        );

        const toSeed = workerIds.filter(
          (id) => !loggedSet.has(id) && !existingSet.has(id),
        );
        if (!toSeed.length) {
          continue;
        }

        await this.stateModel
          .insertMany(
            toSeed.map((workerId) => ({
              companyId,
              projectId,
              workerId,
              date: today,
              remindersSent: 0,
              nextRunAt: now,
              status: HoursReminderStatus.Active,
            })),
            { ordered: false },
          )
          .catch(() => {
            // Ignore duplicate-key races from overlapping ticks.
          });
      }
    }
  }

  private async fireDueStates(
    ruleByCompany: Map<string, HoursReminderRule>,
    now: Date,
    today: string,
  ): Promise<void> {
    const due = await this.stateModel
      .find({
        status: HoursReminderStatus.Active,
        date: today,
        nextRunAt: { $lte: now },
      })
      .exec();

    for (const state of due) {
      const rule = ruleByCompany.get(String(state.companyId));
      if (!rule || !rule.enabled) {
        state.status = HoursReminderStatus.Stopped;
        await state.save();
        continue;
      }

      if (await this.hasReportedHours(String(state.workerId), today)) {
        state.status = HoursReminderStatus.Done;
        await state.save();
        continue;
      }

      const project = await this.projectModel
        .findById(state.projectId)
        .select("name ownerId projectManagerId")
        .lean<{
          name?: string;
          ownerId?: string;
          projectManagerId?: string;
        }>()
        .exec();

      await this.notificationsService.sendToUsers([String(state.workerId)], {
        title: "Log your hours",
        body: project?.name
          ? `Please report how many hours you worked today on ${project.name}.`
          : "Please report how many hours you worked today.",
        data: {
          type: "hours_reminder",
          screen: "Shifts",
          date: today,
          projectId: String(state.projectId),
        },
      });

      state.remindersSent += 1;
      state.lastSentAt = now;
      state.nextRunAt = new Date(now.getTime() + rule.intervalMinutes * 60_000);

      if (
        rule.escalateAfterReminders > 0 &&
        state.remindersSent >= rule.escalateAfterReminders &&
        !state.escalatedAt
      ) {
        const bosses = [project?.projectManagerId, project?.ownerId]
          .filter(Boolean)
          .map((id) => String(id));
        if (bosses.length) {
          await this.notificationsService.sendToUsers(bosses, {
            title: "Hours not reported",
            body: project?.name
              ? `A worker still hasn't reported hours today on ${project.name}.`
              : "A worker still hasn't reported hours today.",
            data: {
              type: "hours_reminder_escalation",
              screen: "Shifts",
              date: today,
              projectId: String(state.projectId),
            },
          });
        }
        state.escalatedAt = now;
      }

      if (rule.maxReminders > 0 && state.remindersSent >= rule.maxReminders) {
        state.status = HoursReminderStatus.Stopped;
      }

      await state.save();
    }
  }
}
