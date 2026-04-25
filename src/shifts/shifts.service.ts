import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { UserRole } from '../users/schemas/user.schema';
import { ListShiftsDto } from './dto/list-shifts.dto';
import { StartShiftDto } from './dto/start-shift.dto';
import {
  Shift,
  ShiftDocument,
  ShiftPhotoFile,
  ShiftSegment,
  ShiftStatus,
} from './schemas/shift.schema';

type AuthenticatedUser = {
  userId: string;
  role: UserRole;
  companyId?: string | null;
};

@Injectable()
export class ShiftsService {
  constructor(
    @InjectModel(Shift.name) private readonly shiftModel: Model<ShiftDocument>,
    @InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>,
  ) {}

  async start(user: AuthenticatedUser, dto: StartShiftDto) {
    await this.finalizeExpiredOpenShifts(user.userId);

    const project = await this.ensureProjectAccess(user, dto.projectId);
    const activeShift = await this.shiftModel
      .findOne({ workerId: user.userId, status: ShiftStatus.Active })
      .exec();

    if (activeShift) {
      throw new BadRequestException('Pause the current shift before starting a new one.');
    }

    const shiftDate = this.getDateKey(new Date());
    const existingShiftForProject = await this.shiftModel
      .findOne({
        workerId: user.userId,
        projectId: dto.projectId,
        shiftDate,
        status: { $in: [ShiftStatus.Active, ShiftStatus.Paused] },
      })
      .sort({ createdAt: -1 })
      .exec();

    if (existingShiftForProject) {
      throw new BadRequestException('A shift for this project already exists today. Resume it instead.');
    }

    const now = new Date();
    const createdShift = await new this.shiftModel({
      workerId: user.userId,
      projectId: dto.projectId,
      projectNameSnapshot: project.name,
      locationSnapshot: project.location || '',
      shiftDate,
      startedAt: now,
      lastResumedAt: now,
      status: ShiftStatus.Active,
      durationMs: 0,
      segments: [
        {
          startedAt: now,
          durationMs: 0,
        },
      ],
      photos: [],
    }).save();

    return this.serializeShift(createdShift);
  }

  async pause(user: AuthenticatedUser, shiftId: string) {
    await this.finalizeExpiredOpenShifts(user.userId);

    const shift = await this.findOwnedShift(user.userId, shiftId);

    if (shift.status !== ShiftStatus.Active || !shift.lastResumedAt) {
      throw new BadRequestException('Only an active shift can be paused.');
    }

    const now = new Date();
    this.closeOpenSegment(shift, now);
    shift.durationMs = this.sumSegmentDurations(shift.segments);
    shift.lastResumedAt = null;
    shift.endedAt = now;
    shift.status = ShiftStatus.Paused;
    await shift.save();

    return this.serializeShift(shift);
  }

  async resume(user: AuthenticatedUser, shiftId: string) {
    await this.finalizeExpiredOpenShifts(user.userId);

    const shift = await this.findOwnedShift(user.userId, shiftId);

    if (shift.status !== ShiftStatus.Paused) {
      throw new BadRequestException('Only a paused shift can be resumed.');
    }

    const today = this.getDateKey(new Date());
    if (shift.shiftDate !== today) {
      throw new BadRequestException('This shift belongs to a previous day. Start a new shift instead.');
    }

    const activeShift = await this.shiftModel
      .findOne({
        workerId: user.userId,
        status: ShiftStatus.Active,
        _id: { $ne: shiftId },
      })
      .exec();

    if (activeShift) {
      throw new BadRequestException('Pause the current shift before resuming another one.');
    }

    const now = new Date();
    shift.status = ShiftStatus.Active;
    shift.lastResumedAt = now;
    shift.endedAt = undefined;
    shift.segments.push({
      startedAt: now,
      durationMs: 0,
    });
    await shift.save();

    return this.serializeShift(shift);
  }

  async complete(user: AuthenticatedUser, shiftId: string) {
    await this.finalizeExpiredOpenShifts(user.userId);

    const shift = await this.findOwnedShift(user.userId, shiftId);

    if (shift.status === ShiftStatus.Completed) {
      return this.serializeShift(shift);
    }

    const now = new Date();

    if (shift.status === ShiftStatus.Active) {
      this.closeOpenSegment(shift, now);
      shift.durationMs = this.sumSegmentDurations(shift.segments);
      shift.lastResumedAt = null;
    }

    shift.endedAt = now;
    shift.status = ShiftStatus.Completed;
    await shift.save();

    return this.serializeShift(shift);
  }

  async uploadPhotos(user: AuthenticatedUser, shiftId: string, files: ShiftPhotoFile[]) {
    await this.finalizeExpiredOpenShifts(user.userId);

    const shift = await this.findOwnedShift(user.userId, shiftId);
    shift.photos = [...(shift.photos || []), ...files];
    await shift.save();

    return this.serializeShift(shift);
  }

  async getCurrent(user: AuthenticatedUser, projectId?: string) {
    await this.finalizeExpiredOpenShifts(user.userId);

    const today = this.getDateKey(new Date());
    const shift = await this.shiftModel
      .findOne({
        workerId: user.userId,
        shiftDate: today,
        ...(projectId ? { projectId } : {}),
        status: { $in: [ShiftStatus.Active, ShiftStatus.Paused] },
      })
      .sort({ updatedAt: -1, createdAt: -1 })
      .exec();

    return shift ? this.serializeShift(shift) : null;
  }

  async getMonths(user: AuthenticatedUser) {
    const shiftDates = await this.shiftModel.distinct('shiftDate', { workerId: user.userId }).exec();

    return Array.from(
      new Set(
        shiftDates
          .filter((shiftDate) => typeof shiftDate === 'string' && shiftDate.length >= 7)
          .map((shiftDate) => shiftDate.slice(0, 7)),
      ),
    ).sort((left, right) => right.localeCompare(left));
  }

  async getHistory(user: AuthenticatedUser, query: ListShiftsDto) {
    await this.finalizeExpiredOpenShifts(user.userId);

    const availableMonths = await this.getMonths(user);
    const fallbackMonth = availableMonths[0] || this.getMonthKey(new Date());
    const month = query.month || fallbackMonth;

    const monthShifts = await this.shiftModel
      .find({
        workerId: user.userId,
        shiftDate: new RegExp(`^${month}`),
        ...(query.projectId ? { projectId: query.projectId } : {}),
      })
      .sort({ shiftDate: 1, startedAt: 1 })
      .exec();

    const previousMonth = this.getPreviousMonthKey(month);

    return {
      month,
      availableMonths,
      monthTotalDurationMs: this.sumShiftDurations(monthShifts),
      previousMonthTotalDurationMs: await this.sumMonthDurations(user.userId, previousMonth),
      days: this.groupShiftsByDay(monthShifts, 'asc'),
    };
  }

  async list(user: AuthenticatedUser, query: ListShiftsDto) {
    await this.finalizeExpiredOpenShifts(user.userId);

    const filter: Record<string, unknown> = { workerId: user.userId };

    if (query.projectId) {
      filter.projectId = query.projectId;
    }

    if (query.month) {
      filter.shiftDate = new RegExp(`^${query.month}`);
    } else if (query.from || query.to) {
      filter.shiftDate = {};

      if (query.from) {
        (filter.shiftDate as Record<string, string>).$gte = query.from;
      }

      if (query.to) {
        (filter.shiftDate as Record<string, string>).$lte = query.to;
      }
    }

    const shifts = await this.shiftModel
      .find(filter)
      .sort({ shiftDate: -1, startedAt: 1 })
      .exec();

    return {
      days: this.groupShiftsByDay(shifts, 'desc'),
    };
  }

  private async findOwnedShift(userId: string, shiftId: string) {
    const shift = await this.shiftModel.findOne({ _id: shiftId, workerId: userId }).exec();

    if (!shift) {
      throw new NotFoundException(`Shift with ID "${shiftId}" not found`);
    }

    return shift;
  }

  private async ensureProjectAccess(user: AuthenticatedUser, projectId: string) {
    const project = await this.projectModel.findById(projectId).exec();

    if (!project) {
      throw new NotFoundException(`Project with ID "${projectId}" not found`);
    }

    if (user.role === UserRole.SuperAdmin) {
      return project;
    }

    if (user.role === UserRole.CompanyAdmin) {
      if (project.companyId !== user.companyId) {
        throw new ForbiddenException('You do not have access to this project.');
      }

      return project;
    }

    if (user.role === UserRole.ProjectAdmin) {
      const hasAccess =
        project.ownerId === user.userId ||
        project.projectManagerId === user.userId ||
        project.projectAdmins.includes(user.userId);

      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to this project.');
      }

      return project;
    }

    if (user.role === UserRole.Worker && !project.workers.includes(user.userId)) {
      throw new ForbiddenException('You do not have access to this project.');
    }

    return project;
  }

  private async finalizeExpiredOpenShifts(userId: string) {
    const today = this.getDateKey(new Date());
    const outdatedShifts = await this.shiftModel
      .find({
        workerId: userId,
        shiftDate: { $lt: today },
        status: { $in: [ShiftStatus.Active, ShiftStatus.Paused] },
      })
      .exec();

    for (const shift of outdatedShifts) {
      const shiftDayEnd = this.getDayEnd(shift.shiftDate);

      if (shift.status === ShiftStatus.Active) {
        this.closeOpenSegment(shift, shiftDayEnd);
        shift.durationMs = this.sumSegmentDurations(shift.segments);
        shift.lastResumedAt = null;
      }

      shift.endedAt = shift.endedAt || shift.segments[shift.segments.length - 1]?.endedAt || shiftDayEnd;
      shift.status = ShiftStatus.Completed;
      await shift.save();
    }
  }

  private closeOpenSegment(shift: ShiftDocument, endedAt: Date) {
    const activeSegment = [...shift.segments].reverse().find((segment) => !segment.endedAt);

    if (!activeSegment) {
      return;
    }

    const startedAt = new Date(activeSegment.startedAt);
    const safeEnd = endedAt.getTime() < startedAt.getTime() ? startedAt : endedAt;

    activeSegment.endedAt = safeEnd;
    activeSegment.durationMs = Math.max(0, safeEnd.getTime() - startedAt.getTime());
  }

  private sumMonthDurations(workerId: string, month: string) {
    return this.shiftModel
      .find({ workerId, shiftDate: new RegExp(`^${month}`) })
      .exec()
      .then((shifts) => this.sumShiftDurations(shifts));
  }

  private sumShiftDurations(shifts: ShiftDocument[]) {
    return shifts.reduce((total, shift) => total + this.getEffectiveDuration(shift), 0);
  }

  private sumSegmentDurations(segments: ShiftSegment[]) {
    return segments.reduce((total, segment) => total + (segment.durationMs || 0), 0);
  }

  private groupShiftsByDay(shifts: ShiftDocument[], order: 'asc' | 'desc') {
    const grouped = new Map<
      string,
      {
        date: string;
        totalDurationMs: number;
        shifts: ReturnType<ShiftsService['serializeShift']>[];
      }
    >();

    for (const shift of shifts) {
      const key = shift.shiftDate;
      const serializedShift = this.serializeShift(shift);
      const current = grouped.get(key) || {
        date: key,
        totalDurationMs: 0,
        shifts: [],
      };

      current.totalDurationMs += serializedShift.durationMs;
      current.shifts.push(serializedShift);
      grouped.set(key, current);
    }

    return Array.from(grouped.values()).sort((left, right) =>
      order === 'asc' ? left.date.localeCompare(right.date) : right.date.localeCompare(left.date),
    );
  }

  private serializeShift(shift: ShiftDocument) {
    const effectiveDurationMs = this.getEffectiveDuration(shift);
    const shiftId = (shift as unknown as { _id: { toString(): string } })._id.toString();

    return {
      id: shiftId,
      workerId: shift.workerId,
      projectId: shift.projectId,
      projectName: shift.projectNameSnapshot,
      location: shift.locationSnapshot,
      shiftDate: shift.shiftDate,
      startedAt: shift.startedAt,
      endedAt: shift.endedAt,
      lastResumedAt: shift.lastResumedAt,
      status: shift.status,
      durationMs: effectiveDurationMs,
      storedDurationMs: shift.durationMs,
      photos: (shift.photos || []).map((photo) => ({
        name: photo.name,
        url: photo.url,
        mimeType: photo.mimeType,
        size: photo.size,
        uploadedAt: photo.uploadedAt,
      })),
      segments: (shift.segments || []).map((segment) => ({
        startedAt: segment.startedAt,
        endedAt: segment.endedAt,
        durationMs:
          segment.durationMs ||
          (segment.endedAt
            ? Math.max(0, new Date(segment.endedAt).getTime() - new Date(segment.startedAt).getTime())
            : 0),
      })),
    };
  }

  private getEffectiveDuration(shift: ShiftDocument) {
    if (shift.status !== ShiftStatus.Active || !shift.lastResumedAt) {
      return shift.durationMs || this.sumSegmentDurations(shift.segments || []);
    }

    return shift.durationMs + Math.max(0, Date.now() - new Date(shift.lastResumedAt).getTime());
  }

  private getDateKey(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private getMonthKey(date: Date) {
    return this.getDateKey(date).slice(0, 7);
  }

  private getPreviousMonthKey(monthKey: string) {
    const [year, month] = monthKey.split('-').map(Number);
    const previousMonthDate = new Date(year, month - 2, 1);

    return this.getMonthKey(previousMonthDate);
  }

  private getDayEnd(shiftDate: string) {
    const [year, month, day] = shiftDate.split('-').map(Number);

    return new Date(year, month - 1, day, 23, 59, 59, 999);
  }
}
