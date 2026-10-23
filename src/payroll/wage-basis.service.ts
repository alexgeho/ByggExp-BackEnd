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
import { Shift, ShiftDocument } from '../shifts/schemas/shift.schema';
import {
  LeaveRequest,
  LeaveRequestDocument,
  LeaveStatus,
} from '../leave/schemas/leave-request.schema';
import {
  AgreementRuleSet,
  AgreementRuleSetDocument,
  AgreementRuleSetStatus,
} from './schemas/agreement-rule-set.schema';
import {
  PayrollSettings,
  PayrollSettingsDocument,
} from './schemas/payroll-settings.schema';
import {
  AgreementRuleSetDto,
  PayrollSettingsDto,
} from './dto/agreement-rule-set.dto';
import {
  ABSENCE_ITEM_LABELS,
  DEFAULT_ABSENCE_CODES,
  SALARY_ITEM_LABELS,
  WageRuleSet,
  WorkerWageBasis,
  buildWorkerWageBasis,
  toWageShifts,
} from './wage-basis';
import { ExportSkipped, buildCsv, buildPaxml } from './wage-export';
import { ExportFormat } from './schemas/payroll-settings.schema';
import { WageRate, WageRateDocument } from './schemas/wage-rate.schema';

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
};

// A lönerunderlag covers at most one quarter, so a typo can't load years.
const MAX_PERIOD_DAYS = 93;

@Injectable()
export class WageBasisService {
  constructor(
    @InjectModel(AgreementRuleSet.name)
    private ruleSetModel: Model<AgreementRuleSetDocument>,
    @InjectModel(PayrollSettings.name)
    private settingsModel: Model<PayrollSettingsDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Shift.name) private shiftModel: Model<ShiftDocument>,
    @InjectModel(LeaveRequest.name)
    private leaveModel: Model<LeaveRequestDocument>,
    @InjectModel(WageRate.name)
    private wageRateModel: Model<WageRateDocument>,
  ) {}

  // ---- Avtalsregler -------------------------------------------------------

  // Company admins see published versions only; drafts are the superadmin's
  // work in progress and never feed a calculation.
  async listRuleSets(user: AuthUser): Promise<AgreementRuleSet[]> {
    const filter =
      user.role === UserRole.SuperAdmin
        ? {}
        : { status: AgreementRuleSetStatus.Published };
    return this.ruleSetModel.find(filter).sort({ validFrom: -1 }).lean().exec();
  }

  async createRuleSet(
    dto: AgreementRuleSetDto,
  ): Promise<AgreementRuleSetDocument> {
    if (!dto.name || !dto.validFrom) {
      throw new BadRequestException('name and validFrom are required');
    }
    this.assertValidRange(dto.validFrom, dto.validTo);
    return new this.ruleSetModel({
      ...dto,
      status: AgreementRuleSetStatus.Draft,
    }).save();
  }

  // Starts the next agreement version from an existing one: same structure,
  // new dates, back in draft so every number is checked again.
  async duplicateRuleSet(id: string): Promise<AgreementRuleSetDocument> {
    const source = await this.getRuleSet(id);
    const copy = source.toObject() as unknown as Record<string, unknown>;
    delete copy._id;
    delete copy.createdAt;
    delete copy.updatedAt;
    return new this.ruleSetModel({
      ...copy,
      name: `${source.name} (kopia)`,
      status: AgreementRuleSetStatus.Draft,
      publishedAt: null,
      publishedByUserId: null,
    }).save();
  }

  async updateRuleSet(
    id: string,
    dto: AgreementRuleSetDto,
  ): Promise<AgreementRuleSetDocument> {
    const ruleSet = await this.getRuleSet(id);
    // A published version has been used for real pay: its figures are frozen.
    // Only its end date may change (to close it when the next agreement starts).
    if (ruleSet.status === AgreementRuleSetStatus.Published) {
      const keys = Object.keys(dto).filter(
        (k) => (dto as Record<string, unknown>)[k] !== undefined,
      );
      if (keys.some((k) => k !== 'validTo' && k !== 'sourceNote')) {
        throw new BadRequestException(
          'A published agreement version is locked — duplicate it to make changes',
        );
      }
    }
    this.assertValidRange(
      dto.validFrom ?? ruleSet.validFrom,
      dto.validTo ?? ruleSet.validTo,
    );
    ruleSet.set(dto);
    return ruleSet.save();
  }

  async publishRuleSet(
    id: string,
    user: AuthUser,
    confirmed = false,
  ): Promise<AgreementRuleSetDocument> {
    const ruleSet = await this.getRuleSet(id);
    if (ruleSet.status === AgreementRuleSetStatus.Published) return ruleSet;
    if (ruleSet.aiDraft && !confirmed) {
      throw new BadRequestException(
        'This draft was read by AI — confirm that every figure has been checked against the source',
      );
    }
    if (!ruleSet.sourceNote?.trim()) {
      throw new BadRequestException(
        'Add the source (agreement section / circular) before publishing',
      );
    }
    if (!ruleSet.minimumWages?.length) {
      throw new BadRequestException(
        'Add the minimum wages before publishing',
      );
    }
    ruleSet.status = AgreementRuleSetStatus.Published;
    ruleSet.publishedAt = new Date();
    ruleSet.publishedByUserId = user.userId || null;
    return ruleSet.save();
  }

  async removeRuleSet(id: string): Promise<void> {
    const ruleSet = await this.getRuleSet(id);
    if (ruleSet.status === AgreementRuleSetStatus.Published) {
      throw new BadRequestException(
        'A published agreement version cannot be deleted',
      );
    }
    await ruleSet.deleteOne();
  }

  private async getRuleSet(id: string): Promise<AgreementRuleSetDocument> {
    const ruleSet = await this.ruleSetModel.findById(id).exec();
    if (!ruleSet) {
      throw new NotFoundException(`Agreement version "${id}" not found`);
    }
    return ruleSet;
  }

  private assertValidRange(from?: string, to?: string) {
    if (from && to && to < from) {
      throw new BadRequestException('validTo must be on or after validFrom');
    }
  }

  // ---- Company settings ---------------------------------------------------

  async getSettings(user: AuthUser) {
    const companyId = this.resolveCompanyId(user);
    const settings = await this.settingsModel.findOne({ companyId }).lean().exec();
    return {
      companyId,
      agreement: settings?.agreement || 'byggavtalet',
      payrollSystem: settings?.payrollSystem || 'fortnox',
      exportFormat: settings?.exportFormat || 'paxml',
      salaryCodes: settings?.salaryCodes || {},
      absenceCodes: { ...DEFAULT_ABSENCE_CODES, ...(settings?.absenceCodes || {}) },
      onlyApprovedShifts: settings?.onlyApprovedShifts ?? true,
      handledRaises: settings?.handledRaises || [],
      salaryItems: SALARY_ITEM_LABELS,
      absenceItems: ABSENCE_ITEM_LABELS,
    };
  }

  async updateSettings(dto: PayrollSettingsDto, user: AuthUser) {
    const companyId = this.resolveCompanyId(user);
    const clean = (codes?: Record<string, string>) =>
      codes == null
        ? undefined
        : Object.fromEntries(
            Object.entries(codes)
              .filter(([k]) => k in SALARY_ITEM_LABELS || k in ABSENCE_ITEM_LABELS)
              .map(([k, v]) => [k, String(v ?? '').trim()]),
          );
    const update: Record<string, unknown> = {};
    const salaryCodes = clean(dto.salaryCodes);
    const absenceCodes = clean(dto.absenceCodes);
    if (salaryCodes) update.salaryCodes = salaryCodes;
    if (absenceCodes) update.absenceCodes = absenceCodes;
    if (dto.onlyApprovedShifts != null) {
      update.onlyApprovedShifts = dto.onlyApprovedShifts;
    }
    if (dto.payrollSystem) update.payrollSystem = dto.payrollSystem;
    if (dto.exportFormat) update.exportFormat = dto.exportFormat;
    await this.settingsModel
      .findOneAndUpdate({ companyId }, { $set: update }, { upsert: true })
      .exec();
    return this.getSettings(user);
  }

  // ---- Lönerunderlag ------------------------------------------------------

  async buildBasis(from: string, to: string, user: AuthUser) {
    const companyId = this.resolveCompanyId(user);
    this.assertPeriod(from, to);
    const settings = await this.getSettings(user);

    const ruleDocs = await this.ruleSetModel
      .find({
        agreement: settings.agreement,
        status: AgreementRuleSetStatus.Published,
        validFrom: { $lte: to },
        $or: [{ validTo: '' }, { validTo: { $gte: from } }],
      })
      .lean()
      .exec();
    const ruleSets: WageRuleSet[] = ruleDocs.map((r) => ({
      ...(r as unknown as WageRuleSet),
      id: String(r._id),
    }));

    const workers = await this.userModel
      .find({ companyId, erasedAt: null })
      .select('name hourlyRate wageCategory payrollEmployeeId fortnoxEmployeeId')
      .lean()
      .exec();
    const workerIds = workers.map((w) => String(w._id));

    const rateDocs = await this.wageRateModel
      .find({ userId: { $in: workerIds }, validFrom: { $lte: to } })
      .select('userId validFrom hourlyRate')
      .lean()
      .exec();

    const shifts = await this.shiftModel
      .find({
        workerId: { $in: workerIds },
        shiftDate: { $gte: from, $lte: to },
        status: 'completed',
        ...(settings.onlyApprovedShifts ? { approvedAt: { $ne: null } } : {}),
      })
      .select(
        'workerId projectId shiftDate durationMs manualDurationMs hourType overtimeMs overtimeStatus obMs obStatus travelKm travelMinutes perDiem',
      )
      .lean()
      .exec();

    const leaves = await this.leaveModel
      .find({
        companyId,
        userId: { $in: workerIds },
        status: LeaveStatus.Approved,
        startDate: { $lte: to },
        endDate: { $gte: from },
      })
      .lean()
      .exec();

    const result: Array<WorkerWageBasis & { payrollEmployeeId: string }> = [];
    for (const w of workers) {
      const id = String(w._id);
      const own = shifts.filter((s) => String(s.workerId) === id);
      const ownLeaves = leaves.filter((l) => String(l.userId) === id);
      if (!own.length && !ownLeaves.length) continue;
      const basis = buildWorkerWageBasis(
        {
          userId: id,
          name: w.name || '',
          hourlyRate: w.hourlyRate ?? null,
          wageCategory: w.wageCategory ?? null,
          rates: rateDocs
            .filter((r) => String(r.userId) === id)
            .map((r) => ({ validFrom: r.validFrom, hourlyRate: r.hourlyRate })),
        },
        own.flatMap((s) =>
          toWageShifts({
            shiftDate: s.shiftDate,
            durationMs: s.durationMs,
            manualDurationMs: s.manualDurationMs,
            hourType: s.hourType,
            overtimeMs: s.overtimeMs,
            obMs: s.obMs,
            obStatus: s.obStatus,
            overtimeStatus: s.overtimeStatus,
            travelKm: s.travelKm,
            travelMinutes: s.travelMinutes,
            perDiem: s.perDiem,
            projectId: String(s.projectId),
          }),
        ),
        ownLeaves.map((l) => ({
          type: l.type,
          startDate: l.startDate,
          endDate: l.endDate,
          halfDay: l.halfDay,
        })),
        ruleSets,
        { from, to },
      );
      const employeeId = (w.payrollEmployeeId || w.fortnoxEmployeeId || '').trim();
      if (!employeeId) {
        basis.warnings.push({
          code: 'missing_employee_id',
          message:
            'Anställningsnummer i lönesystemet saknas — personen kommer inte med i exporten.',
        });
      }
      result.push({ ...basis, payrollEmployeeId: employeeId });
    }

    result.sort((a, b) => a.name.localeCompare(b.name, 'sv'));

    // Items the company hasn't mapped to a löneart would silently vanish
    // from the export — surface them once for the whole period.
    const unmapped = new Set<string>();
    for (const w of result) {
      for (const item of w.items) {
        const codes =
          item.kind === 'absence' ? settings.absenceCodes : settings.salaryCodes;
        if (!String(codes[item.code] || '').trim()) unmapped.add(item.code);
      }
    }

    return {
      period: { from, to },
      ruleSets: ruleSets.map((r) => ({
        id: r.id,
        name: r.name,
        validFrom: r.validFrom,
        validTo: r.validTo || '',
      })),
      // Agreement raises in force in this period that the company hasn't
      // applied to its workers' wages yet.
      pendingRaises: ruleSets
        .filter(
          (r) =>
            r.wageRaiseKind &&
            Number(r.wageRaiseValue) > 0 &&
            !settings.handledRaises.includes(r.id),
        )
        .map((r) => ({
          ruleSetId: r.id,
          name: r.name,
          validFrom: r.validFrom,
          kind: r.wageRaiseKind,
          value: r.wageRaiseValue,
        })),
      unmappedCodes: [...unmapped].sort(),
      workers: result,
    };
  }

  // Writes the lönerunderlag in the company's chosen format (or `format` when
  // the caller asks for one explicitly).
  async exportBasis(
    from: string,
    to: string,
    user: AuthUser,
    format?: ExportFormat,
  ): Promise<{
    content: string;
    contentType: string;
    skipped: ExportSkipped[];
    filename: string;
  }> {
    const basis = await this.buildBasis(from, to, user);
    const settings = await this.getSettings(user);
    const company = await this.companyModel
      .findById(settings.companyId)
      .select('name orgNumber')
      .lean()
      .exec();

    const input = {
      companyName: company?.name || '',
      orgNumber: company?.orgNumber || '',
      generatedAt: new Date(),
      workers: basis.workers.map((w) => ({
        userId: w.userId,
        name: w.name,
        items: w.items,
        employeeId: w.payrollEmployeeId,
      })),
      salaryCodes: settings.salaryCodes,
      absenceCodes: settings.absenceCodes,
    };
    const csv = (format || settings.exportFormat) === 'csv';
    const { content, skipped } = csv ? buildCsv(input) : buildPaxml(input);
    return {
      content,
      contentType: csv ? 'text/csv; charset=utf-8' : 'application/xml; charset=utf-8',
      skipped,
      filename: `lonerunderlag-${from}-${to}.${csv ? 'csv' : 'xml'}`,
    };
  }

  private assertPeriod(from: string, to: string) {
    if (to < from) {
      throw new BadRequestException('"to" must be on or after "from"');
    }
    const days =
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000;
    if (days > MAX_PERIOD_DAYS) {
      throw new BadRequestException(
        `A lönerunderlag can cover at most ${MAX_PERIOD_DAYS} days`,
      );
    }
  }

  private resolveCompanyId(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException('Your account is not attached to a company');
    }
    return user.companyId;
  }
}
