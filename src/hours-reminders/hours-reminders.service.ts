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
import { Project, ProjectDocument } from "../projects/schemas/project.schema";
import { Shift, ShiftDocument } from "../shifts/schemas/shift.schema";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import {
  Company,
  CompanyDocument,
  HoursReminderRule,
} from "../company/schemas/company.schema";

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
  timeOfDay: "17:00",
  weekdays: [1, 2, 3, 4, 5],
  onlyMissing: true,
  lastSentAt: null,
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
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Same day key format the shifts write to Shift.shiftDate (server-local).
  private getDateKey(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  // Local (Stockholm) hour, YYYY-MM-DD day key and ISO weekday (1=Mon…7=Sun).
  private localParts(now: Date) {
    const hour = Number(
      now.toLocaleString("en-GB", {
        timeZone: TZ,
        hour: "2-digit",
        hour12: false,
      }),
    );
    const dayKey = now.toLocaleDateString("en-CA", { timeZone: TZ });
    const dow = new Date(`${dayKey}T00:00:00Z`).getUTCDay(); // 0=Sun
    const weekday = ((dow + 6) % 7) + 1; // 1=Mon…7=Sun
    return { hour, dayKey, weekday };
  }

  // Drop workers who already reported hours for today (a shift for today with
  // worker-entered manual hours), then push to the rest.
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
      const loggedShifts = await this.shiftModel
        .find({
          workerId: { $in: uniqueTargets },
          shiftDate: today,
          manualDurationMs: { $ne: null },
          ...(opts.projectId ? { projectId: opts.projectId } : {}),
        })
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
        // Deep-link into the app's shift/hours screen for today.
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

  // ---- Recurring rule (company-wide daily nudge) ----

  private normalizeRule(rule?: Partial<HoursReminderRule> | null) {
    return { ...DEFAULT_RULE, ...(rule || {}) };
  }

  async getRule(companyId?: string) {
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
    // lastSentAt stays server-managed and is never taken from the client.
    const next = this.normalizeRule({
      ...current,
      ...patch,
      lastSentAt: current.lastSentAt,
    });

    await this.companyModel
      .updateOne({ _id: companyId }, { $set: { hoursReminderRule: next } })
      .exec();

    return next;
  }

  private isRuleDue(rule: HoursReminderRule, now: Date): boolean {
    if (!rule.enabled) {
      return false;
    }
    const { hour, dayKey, weekday } = this.localParts(now);
    if (!rule.weekdays?.includes(weekday)) {
      return false;
    }
    if (hour !== Number(String(rule.timeOfDay).slice(0, 2))) {
      return false;
    }
    // Fire at most once per local day.
    const last = rule.lastSentAt ? new Date(rule.lastSentAt) : null;
    const lastDay = last
      ? last.toLocaleDateString("en-CA", { timeZone: TZ })
      : null;
    return lastDay !== dayKey;
  }

  private async nudgeCompanyWorkers(
    companyId: string,
    onlyMissing: boolean,
  ): Promise<NudgeResult> {
    const workers = await this.userModel
      .find({ role: UserRole.Worker, companyId })
      .select("_id")
      .lean()
      .exec();
    const workerIds = workers.map((worker) => String(worker._id));
    return this.remind(workerIds, { onlyMissing });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async processHoursReminders(): Promise<void> {
    if (cronsDisabled() || this.isRunning) {
      return;
    }
    this.isRunning = true;
    try {
      const now = new Date();
      const companies = await this.companyModel
        .find({ "hoursReminderRule.enabled": true })
        .select("_id hoursReminderRule")
        .exec();

      for (const company of companies) {
        const rule = this.normalizeRule(company.hoursReminderRule);
        if (!this.isRuleDue(rule, now)) {
          continue;
        }

        try {
          const result = await this.nudgeCompanyWorkers(
            String(company._id),
            rule.onlyMissing,
          );
          this.logger.log(
            `Hours reminder rule fired for company ${String(company._id)}: reminded=${result.reminded} sent=${result.sent}`,
          );
        } catch (error) {
          this.logger.error(
            `Hours reminder rule failed for company ${String(company._id)}`,
            error,
          );
        }

        // Stamp regardless so the cadence advances even on an all-clear tick.
        await this.companyModel
          .updateOne(
            { _id: company._id },
            { $set: { "hoursReminderRule.lastSentAt": now } },
          )
          .exec();
      }
    } catch (error) {
      this.logger.error("Failed to process hours reminders", error);
    } finally {
      this.isRunning = false;
    }
  }
}
