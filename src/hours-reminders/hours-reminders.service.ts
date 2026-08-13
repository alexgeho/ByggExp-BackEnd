import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { NotificationsService } from "../notifications/notifications.service";
import { Project, ProjectDocument } from "../projects/schemas/project.schema";
import { Shift, ShiftDocument } from "../shifts/schemas/shift.schema";
import { UserRole } from "../users/schemas/user.schema";

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

@Injectable()
export class HoursRemindersService {
  private readonly logger = new Logger(HoursRemindersService.name);

  constructor(
    @InjectModel(Project.name)
    private readonly projectModel: Model<ProjectDocument>,
    @InjectModel(Shift.name)
    private readonly shiftModel: Model<ShiftDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Same day key format the shifts write to Shift.shiftDate (server-local).
  private getDateKey(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  async nudge(params: NudgeParams): Promise<NudgeResult> {
    const { companyId, role, userIds, projectId, onlyMissing } = params;
    const empty: NudgeResult = {
      targeted: 0,
      reminded: 0,
      attempted: 0,
      sent: 0,
    };

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
      // Company admins/project admins may only reach into their own company.
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
      targetIds = [...new Set(userIds.map((id) => String(id)))];
    } else if (project) {
      targetIds = [...new Set((project.workers || []).map((id) => String(id)))];
    } else {
      throw new BadRequestException("Provide userIds or projectId");
    }

    if (!targetIds.length) {
      return empty;
    }

    let remindIds = targetIds;
    const today = this.getDateKey(new Date());

    if (onlyMissing) {
      // "Logged hours" = a shift for today with worker-entered manual hours.
      const loggedShifts = await this.shiftModel
        .find({
          workerId: { $in: targetIds },
          shiftDate: today,
          manualDurationMs: { $ne: null },
          ...(projectId ? { projectId } : {}),
        })
        .select("workerId")
        .lean()
        .exec();

      const loggedSet = new Set(
        loggedShifts.map((shift) => String(shift.workerId)),
      );
      remindIds = targetIds.filter((id) => !loggedSet.has(id));
    }

    if (!remindIds.length) {
      return { ...empty, targeted: targetIds.length };
    }

    const result = await this.notificationsService.sendToUsers(remindIds, {
      title: "Log your hours",
      body: project?.name
        ? `Please report how many hours you worked today on ${project.name}.`
        : "Please report how many hours you worked today.",
      data: {
        type: "hours_reminder",
        // Deep-link into the app's shift/hours screen for today.
        screen: "Shifts",
        date: today,
        ...(projectId ? { projectId } : {}),
      },
    });

    this.logger.log(
      `Hours nudge: targeted=${targetIds.length} reminded=${remindIds.length} sent=${result.sent}`,
    );

    return {
      targeted: targetIds.length,
      reminded: remindIds.length,
      attempted: result.attempted,
      sent: result.sent,
    };
  }
}
