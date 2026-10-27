import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import { Company, CompanyDocument } from "../company/schemas/company.schema";
import { launchForInvoicePdf } from "../invoices/puppeteer-launch";
import { buildPayslipHtml } from "./templates/payslip-pdf.template";
import { computeLineAmounts, computeRunTotals } from "./payroll-math";
import { TaxTableService } from "./tax-table.service";
import { Project, ProjectDocument } from "../projects/schemas/project.schema";
import { AgiEmployee, agiProblems, buildAgiXml, mergeEmployees } from "./agi";
import { CreatePayrollRunDto } from "./dto/create-payroll-run.dto";
import {
  PayrollRun,
  PayrollRunDocument,
  PayrollStatus,
} from "./schemas/payroll-run.schema";

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
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    private readonly taxTableService: TaxTableService,
  ) {}

  // A per-worker lönespecifikation PDF for one line of a run.
  async buildPayslipPdf(
    id: string,
    userId: string,
    user: AuthUser,
  ): Promise<Buffer> {
    const run = await this.findOne(id, user);
    const line = (run.lines || []).find(
      (l) => String(l.userId) === String(userId),
    );
    if (!line) {
      throw new NotFoundException("No payslip for that worker in this run");
    }
    const company = await this.companyModel
      .findById(run.companyId)
      .select("name orgNumber")
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
      await page.setContent(html, { waitUntil: "load" });
      return Buffer.from(
        await page.pdf({ format: "A4", printBackground: true }),
      );
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
      .select("name hourlyRate taxTable taxColumn")
      .exec();
    const byId = new Map(users.map((u) => [String(u._id), u]));

    const taxRate = dto.taxRate ?? 30;
    const employerRate = 31.42;

    const lines = await Promise.all(
      dto.lines
        .filter((l) => byId.has(String(l.userId)))
        .map(async (l) => {
          const u = byId.get(String(l.userId));
          const rate = round2(u?.hourlyRate ?? l.rate ?? 0);
          const hours = round2(l.hours);
          const multiplier =
            Number(l.multiplier) > 0 ? Number(l.multiplier) : 1;
          const { gross, tax: pctTax } = computeLineAmounts(
            hours,
            rate,
            multiplier,
            taxRate,
          );
          // Prefer the worker's Skatteverket tax table when set (and available);
          // otherwise fall back to the flat percentage.
          // Tax tables are per income year: the year the period ends in.
          const tableTax = await this.taxTableService.lookupMonthlyTax(
            u?.taxTable,
            u?.taxColumn,
            gross,
            Number(String(dto.periodTo).slice(0, 4)) || undefined,
          );
          const tax = tableTax == null ? pctTax : round2(tableTax);
          const net = round2(gross - tax);
          return {
            userId: String(l.userId),
            name: u?.name || l.name || "",
            hours,
            rate,
            multiplier,
            hourType: l.hourType || "normal",
            amount: gross,
            tax,
            net,
          };
        }),
    );

    if (!lines.length) {
      throw new BadRequestException(
        "No matching workers for this company in the payroll run",
      );
    }

    const totals = computeRunTotals(lines, employerRate);

    const run = new this.payrollModel({
      companyId,
      periodFrom: dto.periodFrom,
      periodTo: dto.periodTo,
      basis: dto.basis || "planned",
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
      throw new BadRequestException("A paid payroll run cannot be deleted");
    }
    await this.payrollModel.findByIdAndDelete(id).exec();
    return run;
  }

  private resolveCompanyId(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return user.companyId;
  }

  private assertCanAccess(run: PayrollRunDocument, user: AuthUser): void {
    if (!user.companyId || String(run.companyId) !== String(user.companyId)) {
      throw new ForbiddenException(
        "You do not have access to this payroll run",
      );
    }
  }

  // ---- AGI (arbetsgivardeklaration) ----------------------------------------

  // Approved/paid runs whose pay went out in `period` (YYYYMM; paidAt, else
  // the end of the run period) → AGI rows, money summary and blocking problems.
  async agi(period: string, user: AuthUser) {
    const companyId = this.resolveCompanyId(user);
    if (!/^\d{6}$/.test(period || "")) {
      throw new BadRequestException("period must be YYYYMM");
    }
    const ym = `${period.slice(0, 4)}-${period.slice(4)}`;
    const runs = (
      await this.payrollModel
        .find({
          companyId,
          status: { $in: [PayrollStatus.Approved, PayrollStatus.Paid] },
        })
        .lean()
        .exec()
    ).filter((r) =>
      (r.paidAt ? new Date(r.paidAt).toISOString() : String(r.periodTo))
        .slice(0, 7)
        .startsWith(ym),
    );
    const userIds = [
      ...new Set(runs.flatMap((r) => r.lines.map((l) => l.userId))),
    ];
    const projectIds = [
      ...new Set(runs.map((r) => r.projectId).filter(Boolean)),
    ];
    const [users, projects, company, me] = await Promise.all([
      this.userModel
        .find({ _id: { $in: userIds }, companyId })
        .select("+personalNumber name")
        .lean()
        .exec(),
      this.projectModel
        .find({ _id: { $in: projectIds }, companyId })
        .select("location")
        .lean()
        .exec(),
      this.companyModel.findById(companyId).lean().exec(),
      this.userModel.findById(user.userId).lean().exec(),
    ]);
    const pn = new Map(
      users.map((u) => [String(u._id), u.personalNumber || ""]),
    );
    const place = new Map(
      projects.map((p) => [String(p._id), splitAddress(p.location)]),
    );
    const rows: AgiEmployee[] = runs.flatMap((r) =>
      r.lines.map((l) => {
        const at = r.projectId ? place.get(String(r.projectId)) : undefined;
        return {
          personalNumber: pn.get(String(l.userId)) || "",
          name: l.name,
          gross: Number(l.amount) || 0,
          tax: Number(l.tax) || 0,
          workplaceStreet: at?.street,
          workplaceCity: at?.city,
        };
      }),
    );
    const phone =
      me?.phoneNumber != null
        ? `${me.phoneAreaCode ? `+${me.phoneAreaCode} ` : ""}${me.phoneNumber}`
        : company?.phone || "";
    const input = {
      period,
      orgNumber: company?.orgNumber || "",
      createdAt: new Date(),
      contact: {
        name: me?.name || "",
        phone,
        email: me?.email || company?.email || "",
      },
      employees: mergeEmployees(rows),
    };
    const sum = (f: (r: (typeof runs)[number]) => number) =>
      Math.round(runs.reduce((a, r) => a + (f(r) || 0), 0));
    return {
      input,
      problems: agiProblems(input),
      summary: {
        period,
        runs: runs.length,
        employees: input.employees.length,
        gross: sum((r) => r.totalGross),
        tax: sum((r) => r.totalTax),
        employerFee: sum((r) => r.employerContribution),
        toPay: sum((r) => (r.totalTax || 0) + (r.employerContribution || 0)),
      },
    };
  }

  async agiXml(period: string, user: AuthUser) {
    const { input, problems } = await this.agi(period, user);
    if (problems.length) {
      throw new BadRequestException({ message: "AGI is incomplete", problems });
    }
    return buildAgiXml(input);
  }
}

// "Storgatan 1, 741 30 Knivsta" → { street, city } (city without postcode).
function splitAddress(location?: string) {
  const parts = String(location || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return undefined;
  const city = parts[parts.length - 1].replace(/^\d{3}\s?\d{2}\s*/, "").trim();
  return city ? { street: parts[0], city } : undefined;
}
