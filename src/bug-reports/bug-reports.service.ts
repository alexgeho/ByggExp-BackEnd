import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserRole } from '../users/schemas/user.schema';
import { CreateBugReportDto } from './dto/create-bug-report.dto';
import {
  BugReport,
  BugReportAttachment,
  BugReportDocument,
  BugReportStatus,
} from './schemas/bug-report.schema';

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
  email?: string;
};

@Injectable()
export class BugReportsService {
  constructor(
    @InjectModel(BugReport.name)
    private bugReportModel: Model<BugReportDocument>,
  ) {}

  async create(
    dto: CreateBugReportDto,
    user: AuthUser,
    attachment?: BugReportAttachment | null,
  ): Promise<BugReport> {
    const message = dto.message?.trim() || '';

    if (!message && !attachment) {
      throw new BadRequestException('Add a message or attach an image');
    }

    const bugReport = new this.bugReportModel({
      message,
      status: BugReportStatus.Open,
      createdByUserId: user.userId,
      reporterEmail: user.email || '',
      reporterRole: user.role,
      companyId: user.companyId || null,
      attachment: attachment || null,
    });

    return bugReport.save();
  }

  async findAccessible(user: AuthUser): Promise<BugReport[]> {
    if (user.role === UserRole.SuperAdmin) {
      return this.bugReportModel.find().sort({ createdAt: -1 }).exec();
    }

    if (user.role === UserRole.CompanyAdmin && user.companyId) {
      return this.bugReportModel
        .find({ companyId: user.companyId })
        .sort({ createdAt: -1 })
        .exec();
    }

    throw new ForbiddenException('You do not have access to bug reports');
  }

  async updateStatus(
    id: string,
    status: BugReportStatus,
    user: AuthUser,
  ): Promise<BugReportDocument> {
    const bugReport = await this.bugReportModel.findById(id).exec();

    if (!bugReport) {
      throw new NotFoundException(`Bug report with ID "${id}" not found`);
    }

    this.assertCanManage(bugReport, user);
    bugReport.status = status;
    await bugReport.save();

    return bugReport;
  }

  private assertCanManage(bugReport: BugReport, user: AuthUser): void {
    if (user.role === UserRole.SuperAdmin) {
      return;
    }

    if (
      user.role === UserRole.CompanyAdmin &&
      user.companyId &&
      String(bugReport.companyId) === String(user.companyId)
    ) {
      return;
    }

    throw new ForbiddenException('You do not have access to this bug report');
  }
}
