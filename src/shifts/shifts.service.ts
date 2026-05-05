import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import PDFDocument from 'pdfkit';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { ExportShiftsDto } from './dto/export-shifts.dto';
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

type SerializedShiftRecord = {
  id: string;
  workerId: string;
  projectId: string;
  projectName: string;
  location: string;
  shiftDate: string;
  startedAt: Date;
  endedAt?: Date | null;
  lastResumedAt?: Date | null;
  status: ShiftStatus;
  durationMs: number;
  storedDurationMs: number;
  workerName?: string | null;
  photos: Array<{
    name: string;
    url: string;
    mimeType?: string;
    size?: number;
    uploadedAt?: Date;
  }>;
  segments: Array<{
    startedAt: Date;
    endedAt?: Date | null;
    durationMs: number;
  }>;
};

type ShiftDayRecord = {
  date: string;
  totalDurationMs: number;
  shifts: SerializedShiftRecord[];
};

type ShiftExportResult = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

@Injectable()
export class ShiftsService {
  constructor(
    @InjectModel(Shift.name) private readonly shiftModel: Model<ShiftDocument>,
    @InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
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

  async getMonths(user: AuthenticatedUser, query: Pick<ListShiftsDto, 'projectId' | 'workerId'> = {}) {
    const filter = await this.buildAccessibleShiftFilter(user, query);
    const shiftDates = await this.shiftModel.distinct('shiftDate', filter).exec();

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

    const availableMonths = await this.getMonths(user, query);
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

    const serializedShifts = await this.serializeShifts(monthShifts);

    return {
      month,
      availableMonths,
      monthTotalDurationMs: this.sumShiftDurations(monthShifts),
      previousMonthTotalDurationMs: await this.sumMonthDurations(user.userId, previousMonth),
      days: this.groupSerializedShiftsByDay(serializedShifts, 'asc'),
    };
  }

  async list(user: AuthenticatedUser, query: ListShiftsDto) {
    await this.finalizeExpiredOpenShifts(user.userId);
    const shifts = await this.findAccessibleShifts(user, query, 'desc');

    const serializedShifts = await this.serializeShifts(shifts);

    return {
      items: serializedShifts,
      days: this.groupSerializedShiftsByDay(serializedShifts, 'desc'),
    };
  }

  async export(user: AuthenticatedUser, query: ExportShiftsDto): Promise<ShiftExportResult> {
    await this.finalizeExpiredOpenShifts(user.userId);

    const format = query.format || 'pdf';
    const shifts = await this.findAccessibleShifts(user, query, 'asc');
    const serializedShifts = await this.serializeShifts(shifts);
    const days = this.groupSerializedShiftsByDay(serializedShifts, 'asc');
    const totalDurationMs = serializedShifts.reduce((total, shift) => total + shift.durationMs, 0);
    const fileBaseName = this.buildExportFileBaseName(query, days);

    if (format === 'excel') {
      return {
        buffer: await this.buildExcelReport(serializedShifts, days, query, totalDurationMs),
        fileName: `${fileBaseName}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    return {
      buffer: await this.buildPdfReport(serializedShifts, days, query, totalDurationMs),
      fileName: `${fileBaseName}.pdf`,
      mimeType: 'application/pdf',
    };
  }

  async findOneAccessible(user: AuthenticatedUser, shiftId: string) {
    await this.finalizeExpiredOpenShifts(user.userId);

    const filter = await this.buildAccessibleShiftFilter(user, {});
    const shift = await this.shiftModel
      .findOne({
        _id: shiftId,
        ...filter,
      })
      .exec();

    if (!shift) {
      throw new NotFoundException(`Shift with ID "${shiftId}" not found`);
    }

    return this.serializeShift(shift);
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

  private async findAccessibleShifts(
    user: AuthenticatedUser,
    query: Pick<ListShiftsDto, 'month' | 'from' | 'to' | 'projectId' | 'workerId'>,
    order: 'asc' | 'desc',
  ) {
    const filter = await this.buildAccessibleShiftFilter(user, query);
    this.applyShiftDateFilter(filter, query);

    return this.shiftModel
      .find(filter)
      .sort({ shiftDate: order === 'asc' ? 1 : -1, startedAt: 1 })
      .exec();
  }

  private applyShiftDateFilter(
    filter: Record<string, unknown>,
    query: Pick<ListShiftsDto, 'month' | 'from' | 'to'>,
  ) {
    if (query.month) {
      filter.shiftDate = new RegExp(`^${query.month}`);
      return;
    }

    if (!query.from && !query.to) {
      return;
    }

    filter.shiftDate = {};

    if (query.from) {
      (filter.shiftDate as Record<string, string>).$gte = query.from;
    }

    if (query.to) {
      (filter.shiftDate as Record<string, string>).$lte = query.to;
    }
  }

  private async buildAccessibleShiftFilter(user: AuthenticatedUser, query: ListShiftsDto) {
    const filter: Record<string, unknown> = {};

    if (user.role === UserRole.SuperAdmin) {
      if (query.workerId) {
        filter.workerId = query.workerId;
      }

      if (query.projectId) {
        filter.projectId = query.projectId;
      }

      return filter;
    }

    if (user.role === UserRole.CompanyAdmin) {
      const projectFilter: Record<string, unknown> = {
        companyId: user.companyId,
      };

      if (query.projectId) {
        projectFilter._id = query.projectId;
      }

      const projects = await this.projectModel.find(projectFilter).select('_id').lean().exec();
      const projectIds = projects.map((project) => project._id.toString());

      if (!projectIds.length) {
        return { projectId: { $in: [] } };
      }

      filter.projectId = { $in: projectIds };

      if (query.workerId) {
        filter.workerId = query.workerId;
      }

      return filter;
    }

    if (user.role === UserRole.ProjectAdmin) {
      const projectFilter: Record<string, unknown> = {
        $or: [
          { ownerId: user.userId },
          { projectManagerId: user.userId },
          { projectAdmins: user.userId },
        ],
      };

      if (query.projectId) {
        projectFilter._id = query.projectId;
      }

      const projects = await this.projectModel.find(projectFilter).select('_id').lean().exec();
      const projectIds = projects.map((project) => project._id.toString());

      if (!projectIds.length) {
        return { projectId: { $in: [] } };
      }

      filter.projectId = { $in: projectIds };

      if (query.workerId) {
        filter.workerId = query.workerId;
      }

      return filter;
    }

    filter.workerId = user.userId;

    if (query.projectId) {
      filter.projectId = query.projectId;
    }

    return filter;
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

  private groupSerializedShiftsByDay(
    shifts: SerializedShiftRecord[],
    order: 'asc' | 'desc',
  ): ShiftDayRecord[] {
    const grouped = new Map<string, ShiftDayRecord>();

    for (const shift of shifts) {
      const key = shift.shiftDate;
      const current = grouped.get(key) || {
        date: key,
        totalDurationMs: 0,
        shifts: [],
      };

      current.totalDurationMs += shift.durationMs;
      current.shifts.push(shift);
      grouped.set(key, current);
    }

    return Array.from(grouped.values()).sort((left, right) =>
      order === 'asc' ? left.date.localeCompare(right.date) : right.date.localeCompare(left.date),
    );
  }

  private async serializeShifts(shifts: ShiftDocument[]) {
    const serializedShifts = shifts.map((shift) => this.serializeShift(shift));

    if (!serializedShifts.length) {
      return serializedShifts;
    }

    const workerIds = Array.from(new Set(serializedShifts.map((shift) => shift.workerId).filter(Boolean)));
    const users = await this.userModel.find({ _id: { $in: workerIds } }).select('_id name').lean().exec();
    const workerNamesById = new Map(users.map((user) => [user._id.toString(), user.name]));

    return serializedShifts.map((shift) => ({
      ...shift,
      workerName: workerNamesById.get(shift.workerId) || null,
    }));
  }

  private async buildExcelReport(
    shifts: SerializedShiftRecord[],
    days: ShiftDayRecord[],
    query: ExportShiftsDto,
    totalDurationMs: number,
  ) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Shift report');

    worksheet.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Worker', key: 'worker', width: 24 },
      { header: 'Project', key: 'project', width: 28 },
      { header: 'Location', key: 'location', width: 24 },
      { header: 'Start', key: 'start', width: 22 },
      { header: 'End', key: 'end', width: 22 },
      { header: 'Duration', key: 'duration', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Photos', key: 'photos', width: 10 },
    ];

    worksheet.addRow(['Shift report']);
    worksheet.mergeCells('A1:I1');
    worksheet.getCell('A1').font = { size: 16, bold: true };

    worksheet.addRow(['Generated at', this.formatDateTimeValue(new Date())]);
    worksheet.addRow(['Period', this.getReportPeriodLabel(query, days)]);
    worksheet.addRow(['Total shifts', shifts.length]);
    worksheet.addRow(['Total duration', this.formatDurationLabel(totalDurationMs)]);
    worksheet.addRow([]);

    const headerRow = worksheet.addRow({
      date: 'Date',
      worker: 'Worker',
      project: 'Project',
      location: 'Location',
      start: 'Start',
      end: 'End',
      duration: 'Duration',
      status: 'Status',
      photos: 'Photos',
    });

    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEAF4FF' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD8E6F3' } },
        left: { style: 'thin', color: { argb: 'FFD8E6F3' } },
        bottom: { style: 'thin', color: { argb: 'FFD8E6F3' } },
        right: { style: 'thin', color: { argb: 'FFD8E6F3' } },
      };
    });

    for (const day of days) {
      const dayRow = worksheet.addRow({
        date: day.date,
        duration: this.formatDurationLabel(day.totalDurationMs),
      });
      dayRow.font = { bold: true };

      for (const shift of day.shifts) {
        worksheet.addRow({
          date: shift.shiftDate,
          worker: shift.workerName || shift.workerId,
          project: shift.projectName || shift.projectId,
          location: shift.location || '-',
          start: this.formatDateTimeValue(shift.startedAt),
          end: this.formatDateTimeValue(shift.endedAt),
          duration: this.formatDurationLabel(shift.durationMs),
          status: shift.status,
          photos: shift.photos?.length || 0,
        });
      }
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private buildPdfReport(
    shifts: SerializedShiftRecord[],
    days: ShiftDayRecord[],
    query: ExportShiftsDto,
    totalDurationMs: number,
  ) {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];

      const ensureSpace = (height = 24) => {
        if (doc.y + height > doc.page.height - 40) {
          doc.addPage();
        }
      };

      doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text('Shift report');
      doc.moveDown(0.5);
      doc.fontSize(11).text(`Generated at: ${this.formatDateTimeValue(new Date())}`);
      doc.text(`Period: ${this.getReportPeriodLabel(query, days)}`);
      doc.text(`Total shifts: ${shifts.length}`);
      doc.text(`Total duration: ${this.formatDurationLabel(totalDurationMs)}`);

      if (!days.length) {
        doc.moveDown(1);
        doc.fontSize(11).text('No shifts found for the selected filters.');
        doc.end();
        return;
      }

      for (const day of days) {
        ensureSpace(40);
        doc.moveDown(0.8);
        doc.fontSize(13).text(`${day.date} | ${this.formatDurationLabel(day.totalDurationMs)}`);

        for (const shift of day.shifts) {
          ensureSpace(54);
          doc.moveDown(0.35);
          doc
            .fontSize(10)
            .text(
              `${shift.workerName || shift.workerId} | ${shift.projectName || shift.projectId} | ${this.formatDurationLabel(shift.durationMs)}`,
            );
          doc.text(`Time: ${this.formatTimeValue(shift.startedAt)} - ${this.formatTimeValue(shift.endedAt)}`);
          doc.text(`Location: ${shift.location || '-'} | Status: ${shift.status} | Photos: ${shift.photos?.length || 0}`);
        }
      }

      doc.end();
    });
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

  private getReportPeriodLabel(query: Pick<ListShiftsDto, 'month' | 'from' | 'to'>, days: ShiftDayRecord[]) {
    if (query.month) {
      return query.month;
    }

    if (query.from || query.to) {
      return `${query.from || '...'} - ${query.to || '...'}`;
    }

    if (!days.length) {
      return 'All time';
    }

    return `${days[0].date} - ${days[days.length - 1].date}`;
  }

  private formatDurationLabel(durationMs: number) {
    const totalMinutes = Math.round(Math.max(0, durationMs) / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }

  private formatDateTimeValue(value?: Date | string | null) {
    if (!value) {
      return '-';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatTimeValue(value?: Date | string | null) {
    if (!value) {
      return '-';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private buildExportFileBaseName(
    query: Pick<ListShiftsDto, 'month' | 'from' | 'to'>,
    days: ShiftDayRecord[],
  ) {
    const rawRange =
      query.month || query.from || query.to
        ? `${query.month || query.from || 'from'}-${query.to || query.month || 'to'}`
        : days.length
          ? `${days[0].date}-${days[days.length - 1].date}`
          : 'all-time';

    return `shift-report-${this.sanitizeFilePart(rawRange)}`;
  }

  private sanitizeFilePart(value: string) {
    return value
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }
}
