import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Project, ProjectDocument } from "../projects/schemas/project.schema";
import {
  Shift,
  ShiftDocument,
  ShiftStatus,
} from "../shifts/schemas/shift.schema";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import { parseTimeToMinutes } from "../shifts/shift-schedule.util";
import {
  HourAdjustment,
  HourAdjustmentDocument,
} from "./schemas/hour-adjustment.schema";
import { HoursQueryDto } from "./dto/hours-query.dto";
import { SaveAdjustmentDto } from "./dto/save-adjustment.dto";

type AuthenticatedUser = {
  userId: string;
  role: UserRole;
  companyId?: string | null;
};

const MS_PER_HOUR = 1000 * 60 * 60;
const round = (value: number) => Math.round(value * 100) / 100;

@Injectable()
export class HoursService {
  constructor(
    @InjectModel(Shift.name) private shiftModel: Model<ShiftDocument>,
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(HourAdjustment.name)
    private adjustmentModel: Model<HourAdjustmentDocument>,
  ) {}

  private getEntityId(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    const entity = value as { _id?: unknown; id?: unknown };
    return String(entity._id ?? entity.id ?? "");
  }

  // Planned hours for a day = project workday window; null when the project has
  // no enforced schedule (then there is no planned baseline to compare against).
  private schedulePlanned(
    project: Pick<Project, "shiftSchedule">,
  ): number | null {
    const schedule = project.shiftSchedule;
    if (!schedule?.enabled) return null;
    const minutes =
      parseTimeToMinutes(schedule.workDayEndTime || "16:00") -
      parseTimeToMinutes(schedule.workDayStartTime || "07:00");
    if (!(minutes > 0)) return null;
    return round(minutes / 60);
  }

  // Projects the caller may read hours for, optionally narrowed to one project.
  private async accessibleProjects(
    user: AuthenticatedUser,
    projectId?: string,
  ): Promise<ProjectDocument[]> {
    const filter: Record<string, unknown> = {};

    if (
      user.role === UserRole.SuperAdmin ||
      user.role === UserRole.CompanyAdmin
    ) {
      // Superadmin behaves like a company admin here — scoped to its own
      // company, never across tenants (empty until it has a companyId).
      if (!user.companyId) return [];
      filter.companyId = user.companyId;
      if (projectId) filter._id = projectId;
    } else if (user.role === UserRole.ProjectAdmin) {
      filter.$or = [
        { ownerId: user.userId },
        { projectManagerId: user.userId },
        { projectAdmins: user.userId },
      ];
      if (projectId) filter._id = projectId;
    } else {
      return [];
    }

    return this.projectModel.find(filter).exec();
  }

  async getGrid(user: AuthenticatedUser, query: HoursQueryDto) {
    const projects = await this.accessibleProjects(user, query.projectId);
    const projectById = new Map(projects.map((p) => [this.getEntityId(p), p]));
    const projectIds = [...projectById.keys()];

    if (!projectIds.length) {
      return {
        from: query.from || null,
        to: query.to || null,
        projectId: query.projectId || null,
        workers: [],
      };
    }

    const shiftFilter: Record<string, unknown> = {
      projectId: { $in: projectIds },
    };
    if (query.from || query.to) {
      const range: Record<string, string> = {};
      if (query.from) range.$gte = query.from;
      if (query.to) range.$lte = query.to;
      shiftFilter.shiftDate = range;
    }

    const [shifts, adjustments] = await Promise.all([
      this.shiftModel.find(shiftFilter).lean().exec(),
      this.adjustmentModel
        .find({ projectId: { $in: projectIds } })
        .lean()
        .exec(),
    ]);

    // adjustments keyed by project|worker|date
    const adjMap = new Map<string, HourAdjustment>();
    for (const adj of adjustments) {
      adjMap.set(`${adj.projectId}|${adj.workerId}|${adj.date}`, adj);
    }

    // group shifts by worker → date → { actualMs, projectIds }
    type DayAgg = { actualMs: number; projects: Set<string> };
    const now = Date.now();
    // Live worked time: an active shift's currently-running segment is not yet
    // banked into durationMs, so add the elapsed time since it last resumed —
    // otherwise an in-progress shift reads as 0 hours until it is paused/stopped
    // (which, since offline auto-pause was removed, no longer happens mid-day).
    const workedMs = (shift: Shift): number => {
      const banked = Number(shift.durationMs) || 0;
      if (shift.status !== ShiftStatus.Active) {
        return banked;
      }
      const resumedAt = shift.lastResumedAt || shift.startedAt;
      if (!resumedAt) {
        return banked;
      }
      return banked + Math.max(0, now - new Date(resumedAt).getTime());
    };
    const byWorker = new Map<string, Map<string, DayAgg>>();
    for (const shift of shifts) {
      const workerId = String(shift.workerId);
      const date = String(shift.shiftDate);
      if (!byWorker.has(workerId)) byWorker.set(workerId, new Map());
      const days = byWorker.get(workerId)!;
      if (!days.has(date)) days.set(date, { actualMs: 0, projects: new Set() });
      const day = days.get(date)!;
      day.actualMs += workedMs(shift);
      day.projects.add(String(shift.projectId));
    }

    // Seed rows from planned adjustments in range so a planned-only (e.g. future)
    // day still shows, and from each accessible project's team so the roster is
    // available to plan against even before any shifts exist in the period.
    const inRange = (date: string) =>
      (!query.from || date >= query.from) && (!query.to || date <= query.to);
    for (const adj of adjustments) {
      const date = String(adj.date);
      if (!inRange(date)) continue;
      const workerId = String(adj.workerId);
      if (!byWorker.has(workerId)) byWorker.set(workerId, new Map());
      const days = byWorker.get(workerId)!;
      if (!days.has(date)) days.set(date, { actualMs: 0, projects: new Set() });
      days.get(date)!.projects.add(String(adj.projectId));
    }
    for (const project of projects) {
      for (const teamWorkerId of project.workers || []) {
        const workerId = String(teamWorkerId);
        if (!byWorker.has(workerId)) byWorker.set(workerId, new Map());
      }
    }

    const workerIds = [...byWorker.keys()];
    const users = await this.userModel
      .find({ _id: { $in: workerIds } })
      .select("name role profession avatarUrl")
      .lean()
      .exec();
    const userById = new Map(users.map((u) => [this.getEntityId(u), u]));

    // The Hours grid is about billable workers — never surface a company admin
    // or a superadmin here, even if a stray shift is attributed to them.
    const isStaffRole = (id: string) => {
      const role = userById.get(id)?.role;
      return role !== UserRole.SuperAdmin && role !== UserRole.CompanyAdmin;
    };

    const workers = workerIds.filter(isStaffRole).map((workerId) => {
      const u = userById.get(workerId);
      const days = byWorker.get(workerId)!;
      const cells: Record<string, unknown> = {};

      for (const [date, day] of days) {
        const projectList = [...day.projects];
        let plannedSum = 0;
        let origSum = 0;
        let hasPlan = false;
        let edited = false;

        for (const pid of projectList) {
          const project = projectById.get(pid);
          const basePlanned = project ? this.schedulePlanned(project) : null;
          const adj = adjMap.get(`${pid}|${workerId}|${date}`);
          if (adj) {
            edited = true;
            plannedSum += adj.plannedHours;
            origSum += adj.originalPlannedHours;
            hasPlan = true;
          } else if (basePlanned != null) {
            plannedSum += basePlanned;
            origSum += basePlanned;
            hasPlan = true;
          }
        }

        cells[date] = {
          actual: round(day.actualMs / MS_PER_HOUR),
          planned: hasPlan ? round(plannedSum) : null,
          orig: hasPlan ? round(origSum) : null,
          edited,
          projectId: projectList.length === 1 ? projectList[0] : null,
          multiProject: projectList.length > 1,
        };
      }

      return {
        workerId,
        name: u?.name || "Unknown",
        role: u?.role || null,
        profession: u?.profession || null,
        avatarUrl: u?.avatarUrl || null,
        cells,
      };
    });

    return {
      from: query.from || null,
      to: query.to || null,
      projectId: query.projectId || null,
      workers,
    };
  }

  async saveAdjustment(user: AuthenticatedUser, dto: SaveAdjustmentDto) {
    const [project] = await this.accessibleProjects(user, dto.projectId);
    if (!project) {
      throw new NotFoundException("Project not found or not accessible");
    }

    const companyId =
      this.getEntityId(project.companyId) || String(project.companyId);
    if (!companyId) {
      throw new BadRequestException("Project has no company");
    }
    if (
      (user.role === UserRole.CompanyAdmin ||
        user.role === UserRole.SuperAdmin) &&
      String(user.companyId) !== String(companyId)
    ) {
      throw new ForbiddenException("Project belongs to another company");
    }

    const existing = await this.adjustmentModel
      .findOne({
        companyId,
        projectId: dto.projectId,
        workerId: dto.workerId,
        date: dto.date,
      })
      .exec();

    // Keep the very first schedule-derived value as the trail's origin.
    const originalPlannedHours = existing
      ? existing.originalPlannedHours
      : (this.schedulePlanned(project) ?? 0);

    const saved = await this.adjustmentModel
      .findOneAndUpdate(
        {
          companyId,
          projectId: dto.projectId,
          workerId: dto.workerId,
          date: dto.date,
        },
        {
          companyId,
          projectId: dto.projectId,
          workerId: dto.workerId,
          date: dto.date,
          plannedHours: dto.plannedHours,
          originalPlannedHours,
          updatedByUserId: user.userId,
          ...(dto.note !== undefined ? { note: dto.note } : {}),
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();

    return saved;
  }
}
