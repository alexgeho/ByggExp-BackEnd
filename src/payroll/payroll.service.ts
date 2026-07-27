import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { Company, CompanyDocument } from '../company/schemas/company.schema';
import { launchForInvoicePdf } from '../invoices/puppeteer-launch';
import { buildPayslipHtml } from './templates/payslip-pdf.template';
import { computeLineAmounts, computeRunTotals } from './payroll-math';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import {
  PayrollRun,
  PayrollRunDocument,
  PayrollStatus,
} from './schemas/payroll-run.schema';

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
};

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

@Injectable()
export class PayrollService {
  constructor(
    @InjectModel(PayrollRun.name)
    private payrollModel: Model<PayrollRunDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
  ) {}

  // A per-worker lönespecifikation PDF for one line of a run.
  async buildPayslipPdf(
    id: string,
    userId: string,
    user: AuthUser,
  ): Promise<Buffer> {
    const run = await this.findOne(id, user);
    const line = (run.lines || []).find((l) => String(l.userId) === String(userId));
    if (!line) {
      throw new NotFoundException('No payslip for that worker in this run');
    }
    const company = await this.companyModel
      .findById(run.companyId)
      .select('name orgNumber')
      .lean()
      .exec();

    const html = buildPayslipHtml({
      companyName: company?.name,
      orgNumber: company?.orgNumber,
      periodFrom: run.periodFrom,
      periodTo: run.periodTo,
      taxRate: run.taxRate,
      employerRate: run.employerRate,
      line,
    });

    const browser = await launchForInvoicePdf();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      return Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
    } finally {
      await browser.close();
    }
  }

  async create(
    dto: CreatePayrollRunDto,
    user: AuthUser,
  ): Promise<PayrollRunDocument> {
    const companyId = this.resolveCompanyId(user);

    // Authoritative rates come from each worker's stored hourlyRate; the
    // client-provided rate is only a fallback. Only workers in this company
    // count, so a payroll run can never pull in another tenant's people.
    const ids = [...new Set(dto.lines.map((l) => String(l.userId)))];
    const users = await this.userModel
      .find({ _id: { $in: ids }, companyId })
      .select('name hourlyRate')
      .exec();
    const byId = new Map(users.map((u) => [String(u._id), u]));

    const taxRate = dto.taxRate ?? 30;
    const employerRate = 31.42;

    const lines = dto.lines
      .filter((l) => byId.has(String(l.userId)))
      .map((l) => {
        const u = byId.get(String(l.userId));
        const rate = round2(u?.hourlyRate ?? l.rate ?? 0);
        const hours = round2(l.hours);
        const multiplier = Number(l.multiplier) > 0 ? Number(l.multiplier) : 1;
        const { gross, tax, net } = computeLineAmounts(hours, rate, multiplier, taxRate);
        return {
          userId: String(l.userId),
          name: u?.name || l.name || '',
          hours,
          rate,
          multiplier,
          hourType: l.hourType || 'normal',
          amount: gross,
          tax,
          net,
        };
      });

    if (!lines.length) {
      throw new BadRequestException(
        'No matching workers for this company in the payroll run',
      );
    }

    const totals = computeRunTotals(lines, employerRate);

    const run = new this.payrollModel({
      companyId,
      periodFrom: dto.periodFrom,
      periodTo: dto.periodTo,
      basis: dto.basis || 'planned',
      projectId: dto.projectId || null,
      status: PayrollStatus.Draft,
      lines,
      totalHours: totals.totalHours,
      totalAmount: totals.totalGross,
      taxRate,
      totalGross: totals.totalGross,
      totalTax: totals.totalTax,
      totalNet: totals.totalNet,
      employerRate,
      employerContribution: totals.employerContribution,
      totalEmployerCost: totals.totalEmployerCost,
      createdByUserId: user.userId || null,
    });
    return run.save();
  }

  async findAll(user: AuthUser): Promise<PayrollRun[]> {
    if (!user.companyId) {
      return [];
    }
    return this.payrollModel
      .find({ companyId: user.companyId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string, user: AuthUser): Promise<PayrollRunDocument> {
    const run = await this.payrollModel.findById(id).exec();
    if (!run) {
      throw new NotFoundException(`Payroll run "${id}" not found`);
    }
    this.assertCanAccess(run, user);
    return run;
  }

  async setStatus(
    id: string,
    user: AuthUser,
    status: PayrollStatus,
  ): Promise<PayrollRunDocument> {
    const run = await this.findOne(id, user);
    run.status = status;
    if (status === PayrollStatus.Approved) {
      run.approvedAt = run.approvedAt || new Date();
    } else if (status === PayrollStatus.Paid) {
      run.approvedAt = run.approvedAt || new Date();
      run.paidAt = run.paidAt || new Date();
    } else if (status === PayrollStatus.Draft) {
      run.approvedAt = null;
      run.paidAt = null;
    }
    await run.save();
    return run;
  }

  async remove(id: string, user: AuthUser): Promise<PayrollRun> {
    const run = await this.findOne(id, user);
    if (run.status === PayrollStatus.Paid) {
      throw new BadRequestException('A paid payroll run cannot be deleted');
    }
    await this.payrollModel.findByIdAndDelete(id).exec();
    return run;
  }

  private resolveCompanyId(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException(
        'Your account is not attached to a company',
      );
    }
    return user.companyId;
  }

  private assertCanAccess(run: PayrollRunDocument, user: AuthUser): void {
    if (!user.companyId || String(run.companyId) !== String(user.companyId)) {
      throw new ForbiddenException(
        'You do not have access to this payroll run',
      );
    }
  }
}
