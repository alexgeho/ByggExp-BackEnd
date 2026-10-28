import {
  BadRequestException,
  ConflictException,
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
import {
  computeLineAmounts,
  computeManualItems,
  computeRunTotals,
  isHourItem,
} from "./payroll-math";
import { resolveModules } from "../company/modules";
import { TaxTableService } from "./tax-table.service";
import { Project, ProjectDocument } from "../projects/schemas/project.schema";
import { AgiEmployee, agiProblems, buildAgiXml, mergeEmployees } from "./agi";
import {
  birthYearFromPersonalNumber,
  EMPLOYER_FEE_GENERAL,
  employerFeeFor,
} from "./employer-fee";
import {
  CreatePayrollRunDto,
  ManualPayrollRunDto,
} from "./dto/create-payroll-run.dto";
import {
  ENTERED_BASIS,
  PayrollLine,
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
      .select("name hourlyRate taxTable taxColumn +personalNumber")
      .exec();
    const byId = new Map(users.map((u) => [String(u._id), u]));

    const taxRate = dto.taxRate ?? 30;
    const employerRate = EMPLOYER_FEE_GENERAL;

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
          const { tax, ...taxBasis } = await this.taxFor(
            u,
            gross,
            pctTax,
            taxRate,
            dto.periodTo,
          );
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
            ...taxBasis,
            ...this.employerFeeLine(u, gross, dto.periodTo),
          };
        }),
    );

    if (!lines.length) {
      throw new BadRequestException(
        "No matching workers for this company in the payroll run",
      );
    }

    const run = new this.payrollModel({
      companyId,
      periodFrom: dto.periodFrom,
      periodTo: dto.periodTo,
      basis: dto.basis || "planned",
      projectId: dto.projectId || null,
      status: PayrollStatus.Draft,
      ...runFigures(lines, taxRate, employerRate),
      createdByUserId: user.userId || null,
    });
    return run.save();
  }

  // ---- Manual run (Löner → Ny lönekörning) ---------------------------------
  // For companies without the shifts module: the admin enters hours per hour
  // type, månadslön and other rows per worker. Stored as an ordinary run
  // (basis "manual", one line per worker with its rows in `items`), so the
  // payslip, AGI and exports work unchanged.

  async createManual(
    dto: ManualPayrollRunDto,
    user: AuthUser,
  ): Promise<PayrollRunDocument> {
    const companyId = this.resolveCompanyId(user);
    await this.assertPayrollEnabled(companyId);
    const taxRate = dto.taxRate ?? 30;
    const employerRate = EMPLOYER_FEE_GENERAL;
    const lines = await this.buildManualLines(dto, companyId, taxRate, []);
    const run = new this.payrollModel({
      companyId,
      periodFrom: dto.periodFrom,
      periodTo: dto.periodTo,
      basis: ENTERED_BASIS,
      projectId: null,
      status: PayrollStatus.Draft,
      ...runFigures(lines, taxRate, employerRate),
      createdByUserId: user.userId || null,
    });
    return run.save();
  }

  // Replace the rows of a manual draft and recompute everything.
  async updateManual(
    id: string,
    dto: ManualPayrollRunDto,
    user: AuthUser,
  ): Promise<PayrollRunDocument> {
    const run = await this.findOne(id, user);
    if (run.basis !== ENTERED_BASIS) {
      throw new BadRequestException("Only manual payroll runs can be edited");
    }
    if (run.status !== PayrollStatus.Draft) {
      throw new BadRequestException("Only a draft payroll run can be edited");
    }
    await this.assertPayrollEnabled(run.companyId);
    const taxRate = dto.taxRate ?? run.taxRate ?? 30;
    // Workers already in the run stay editable even if erased since.
    const lines = await this.buildManualLines(
      dto,
      run.companyId,
      taxRate,
      (run.lines || []).map((l) => String(l.userId)),
    );
    // Write only if it is still a manual draft of this company — an approve
    // or delete in between wins instead of being overwritten.
    const updated = await this.payrollModel
      .findOneAndUpdate(
        {
          _id: run._id,
          companyId: run.companyId,
          basis: ENTERED_BASIS,
          status: PayrollStatus.Draft,
        },
        {
          $set: {
            periodFrom: dto.periodFrom,
            periodTo: dto.periodTo,
            ...runFigures(
              lines,
              taxRate,
              run.employerRate ?? EMPLOYER_FEE_GENERAL,
            ),
          },
        },
        { new: true },
      )
      .exec();
    if (!updated) {
      throw new ConflictException(
        "The payroll run changed meanwhile — reload and try again",
      );
    }
    return updated;
  }

  private async buildManualLines(
    dto: ManualPayrollRunDto,
    companyId: string,
    taxRate: number,
    keepUserIds: string[],
  ) {
    if (dto.periodFrom > dto.periodTo) {
      throw new BadRequestException("periodFrom must be before periodTo");
    }
    if (dto.periodFrom.slice(0, 7) !== dto.periodTo.slice(0, 7)) {
      throw new BadRequestException("The period must be within one month");
    }
    const ids = dto.employees.map((e) => String(e.userId));
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException("A worker can only appear once per run");
    }
    const users = await this.userModel
      .find({
        _id: { $in: ids },
        companyId,
        $or: [{ erasedAt: null }, { _id: { $in: keepUserIds } }],
      })
      .select("name hourlyRate taxTable taxColumn +personalNumber")
      .exec();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const unknown = ids.filter((uid) => !byId.has(uid));
    if (unknown.length) {
      throw new BadRequestException("Unknown worker in the payroll run");
    }

    const lines: PayrollLine[] = [];
    for (const e of dto.employees) {
      const u = byId.get(String(e.userId))!;
      const m = computeManualItems(e.items, Number(u.hourlyRate) || 0);
      if (!m.items.length) continue;
      if (m.items.some((i) => isHourItem(i.type) && !i.rate)) {
        throw new BadRequestException(`Hourly rate is missing (${u.name})`);
      }
      if (m.gross < 0) {
        throw new BadRequestException(
          `Gross salary cannot be negative (${u.name})`,
        );
      }
      const { tax: pctTax } = computeLineAmounts(m.gross, 1, 1, taxRate);
      const { tax, ...taxBasis } = await this.taxFor(
        u,
        m.gross,
        pctTax,
        taxRate,
        dto.periodTo,
      );
      lines.push({
        userId: String(u._id),
        name: u.name || "",
        hours: m.hours,
        rate: m.rate,
        multiplier: 1,
        hourType: m.hourType,
        amount: m.gross,
        tax,
        net: round2(m.gross - tax),
        items: m.items,
        ...taxBasis,
        ...this.employerFeeLine(u, m.gross, dto.periodTo),
      });
    }
    if (!lines.length) {
      throw new BadRequestException("Enter hours or an amount for a worker");
    }
    return lines;
  }

  // Prefer the worker's Skatteverket tax table when set (and available);
  // otherwise fall back to the flat percentage. Tax tables are per income
  // year: the year the period ends in. Also returns which basis was used, so
  // the payslip can print it.
  private async taxFor(
    u: { taxTable?: number | null; taxColumn?: number | null } | undefined,
    gross: number,
    pctTax: number,
    taxRate: number,
    periodTo: string,
  ): Promise<{
    tax: number;
    taxTable: number | null;
    taxColumn: number | null;
    taxPercent: number | null;
  }> {
    const tableTax = await this.taxTableService.lookupMonthlyTax(
      u?.taxTable,
      u?.taxColumn,
      gross,
      Number(String(periodTo).slice(0, 4)) || undefined,
    );
    if (tableTax == null) {
      return {
        tax: pctTax,
        taxTable: null,
        taxColumn: null,
        taxPercent: taxRate,
      };
    }
    return {
      tax: round2(tableTax),
      taxTable: Number(u?.taxTable),
      taxColumn: Number(u?.taxColumn),
      taxPercent: null,
    };
  }

  // Age-based arbetsgivaravgift for one worker (general rate when the
  // personnummer is missing).
  private employerFeeLine(
    u: { personalNumber?: string } | undefined,
    gross: number,
    periodTo: string,
  ): { employerRate: number; employerFee: number } {
    const birthYear = birthYearFromPersonalNumber(u?.personalNumber, periodTo);
    const { rate, fee } = employerFeeFor(gross, birthYear, periodTo);
    return { employerRate: rate, employerFee: fee };
  }

  // Manual runs belong to the payroll module (sold without shifts).
  private async assertPayrollEnabled(companyId: string): Promise<void> {
    const company = await this.companyModel
      .findById(companyId)
      .select("plan moduleOverrides")
      .lean()
      .exec();
    if (!company || !resolveModules(company).enabled.includes("payroll")) {
      throw new ForbiddenException("The payroll module is not enabled");
    }
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
    if (run.status === PayrollStatus.Paid && status !== PayrollStatus.Paid) {
      throw new BadRequestException("A paid payroll run cannot be changed");
    }
    if (status === PayrollStatus.Draft && run.status !== PayrollStatus.Draft) {
      throw new BadRequestException(
        "Use reopen to turn an approved run back into a draft",
      );
    }
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

  // Explicit action: an approved (not paid) run back to draft.
  async reopen(id: string, user: AuthUser): Promise<PayrollRunDocument> {
    const run = await this.findOne(id, user);
    if (run.status !== PayrollStatus.Approved) {
      throw new BadRequestException("Only an approved payroll run can reopen");
    }
    run.status = PayrollStatus.Draft;
    run.approvedAt = null;
    run.paidAt = null;
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

// Run-level totals stored on every run (hours grid and manual alike).
function runFigures(
  lines: Parameters<typeof computeRunTotals>[0],
  taxRate: number,
  employerRate: number,
) {
  const totals = computeRunTotals(lines, employerRate);
  return {
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
  };
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
