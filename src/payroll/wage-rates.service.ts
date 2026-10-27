import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { cronsDisabled } from "../common/cron.util";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import {
  AgreementRuleSet,
  AgreementRuleSetDocument,
  AgreementRuleSetStatus,
} from "./schemas/agreement-rule-set.schema";
import {
  PayrollSettings,
  PayrollSettingsDocument,
} from "./schemas/payroll-settings.schema";
import { WageRate, WageRateDocument } from "./schemas/wage-rate.schema";
import { ApplyRaiseDto, WageRateDto } from "./dto/agreement-rule-set.dto";
import { WageRuleSet, proposeRaisedRate } from "./wage-basis";
import { latestRate, recordWageRate, swedishToday } from "./wage-history";

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
};

const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Lönehistorik and Byggavtalet's general raises: each worker's hourly wage is
// dated, and when an agreement version raises wages from 1 May, ByggExp
// proposes every covered worker's new wage for an admin to confirm.
@Injectable()
export class WageRatesService {
  private readonly logger = new Logger(WageRatesService.name);
  private running = false;

  constructor(
    @InjectModel(WageRate.name)
    private wageRateModel: Model<WageRateDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(AgreementRuleSet.name)
    private ruleSetModel: Model<AgreementRuleSetDocument>,
    @InjectModel(PayrollSettings.name)
    private settingsModel: Model<PayrollSettingsDocument>,
  ) {}

  // ---- History -------------------------------------------------------------

  async listRates(userId: string, user: AuthUser) {
    const worker = await this.companyWorker(userId, user);
    const rates = await this.wageRateModel
      .find({ userId })
      .sort({ validFrom: -1 })
      .lean()
      .exec();
    return { userId, currentRate: worker.hourlyRate ?? null, rates };
  }

  async addRate(dto: WageRateDto, user: AuthUser) {
    const worker = await this.companyWorker(dto.userId, user);
    await recordWageRate(this.wageRateModel, {
      companyId: String(worker.companyId),
      userId: dto.userId,
      hourlyRate: dto.hourlyRate,
      validFrom: dto.validFrom,
      reason: "manual",
      previousRate: worker.hourlyRate ?? null,
      createdByUserId: user.userId ?? null,
    });
    await this.syncCurrentRate(dto.userId);
    return this.listRates(dto.userId, user);
  }

  async removeRate(id: string, user: AuthUser) {
    const rate = await this.wageRateModel.findById(id).exec();
    if (!rate) throw new NotFoundException("Wage rate not found");
    await this.companyWorker(rate.userId, user);
    await rate.deleteOne();
    await this.syncCurrentRate(rate.userId);
    return this.listRates(rate.userId, user);
  }

  // ---- Agreement raises ----------------------------------------------------

  // Every published agreement version with a general raise that this company
  // hasn't handled yet, oldest first.
  async pendingRaises(user: AuthUser) {
    const companyId = this.resolveCompanyId(user);
    const settings = await this.settingsModel
      .findOne({ companyId })
      .lean()
      .exec();
    const handled = new Set(settings?.handledRaises || []);
    const versions = await this.ruleSetModel
      .find({
        status: AgreementRuleSetStatus.Published,
        wageRaiseKind: { $in: ["percent", "fixed"] },
        wageRaiseValue: { $gt: 0 },
      })
      .sort({ validFrom: 1 })
      .lean()
      .exec();
    return versions
      .filter((v) => !handled.has(String(v._id)))
      .map((v) => ({
        ruleSetId: String(v._id),
        name: v.name,
        validFrom: v.validFrom,
        kind: v.wageRaiseKind,
        value: v.wageRaiseValue,
      }));
  }

  // The proposed new wage for every covered worker: their wage the day before
  // the raise, plus the raise, lifted to the minimum for their category.
  async proposals(ruleSetId: string, user: AuthUser) {
    const companyId = this.resolveCompanyId(user);
    const version = await this.publishedVersion(ruleSetId);
    const rules = version as unknown as WageRuleSet;
    const dayBefore = addDays(version.validFrom, -1);

    const workers = await this.userModel
      .find({ companyId, erasedAt: null, role: { $ne: UserRole.SuperAdmin } })
      .select("name hourlyRate wageCategory")
      .lean()
      .exec();
    const ids = workers.map((w) => String(w._id));
    const rates = await this.wageRateModel
      .find({ userId: { $in: ids } })
      .select("userId validFrom hourlyRate")
      .lean()
      .exec();

    const items = workers
      // Only workers under the agreement; salaried / "other" are left out.
      .filter((w) => w.wageCategory && w.wageCategory !== "other")
      .map((w) => {
        const own = rates.filter((r) => String(r.userId) === String(w._id));
        const current = latestRate(own, dayBefore) ?? Number(w.hourlyRate) ?? 0;
        const already = own.find((r) => r.validFrom === version.validFrom);
        return {
          userId: String(w._id),
          name: w.name || "",
          wageCategory: w.wageCategory,
          currentRate: current || 0,
          proposedRate: current
            ? proposeRaisedRate(current, rules, w.wageCategory)
            : null,
          alreadySet: already ? already.hourlyRate : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "sv"));

    const uncategorized = workers
      .filter((w) => !w.wageCategory)
      .map((w) => ({ userId: String(w._id), name: w.name || "" }));

    return {
      ruleSet: {
        id: String(version._id),
        name: version.name,
        validFrom: version.validFrom,
        kind: version.wageRaiseKind,
        value: version.wageRaiseValue,
      },
      items,
      uncategorized,
    };
  }

  async applyRaise(dto: ApplyRaiseDto, user: AuthUser) {
    const companyId = this.resolveCompanyId(user);
    const version = await this.publishedVersion(dto.ruleSetId);
    const ids = dto.items.map((i) => i.userId);
    const workers = await this.userModel
      .find({ _id: { $in: ids }, companyId })
      .select("hourlyRate")
      .lean()
      .exec();
    const byId = new Map(workers.map((w) => [String(w._id), w]));
    let applied = 0;
    for (const item of dto.items) {
      const worker = byId.get(item.userId);
      if (!worker || !(item.hourlyRate > 0)) continue;
      await recordWageRate(this.wageRateModel, {
        companyId,
        userId: item.userId,
        hourlyRate: item.hourlyRate,
        validFrom: version.validFrom,
        reason: "agreement_raise",
        previousRate: worker.hourlyRate ?? null,
        ruleSetId: String(version._id),
        createdByUserId: user.userId ?? null,
      });
      await this.syncCurrentRate(item.userId);
      applied++;
    }
    await this.markRaiseHandled(dto.ruleSetId, user);
    return { applied };
  }

  async markRaiseHandled(ruleSetId: string, user: AuthUser) {
    const companyId = this.resolveCompanyId(user);
    await this.settingsModel
      .findOneAndUpdate(
        { companyId },
        { $addToSet: { handledRaises: ruleSetId } },
        { upsert: true },
      )
      .exec();
    return { ok: true };
  }

  // ---- Keeping User.hourlyRate current -------------------------------------

  // A raise dated 1 May is entered weeks ahead; on the day, the worker's
  // current wage (shown across the app) moves to it. Daily at 00:20.
  @Cron("20 0 * * *", { timeZone: "Europe/Stockholm" })
  async syncAll(): Promise<void> {
    if (cronsDisabled() || this.running) return;
    this.running = true;
    try {
      const today = swedishToday();
      const userIds = await this.wageRateModel
        .distinct("userId", { validFrom: today })
        .exec();
      for (const id of userIds) await this.syncCurrentRate(String(id));
    } catch (error) {
      this.logger.error("Wage rate sync failed", error);
    } finally {
      this.running = false;
    }
  }

  private async syncCurrentRate(userId: string): Promise<void> {
    const rates = await this.wageRateModel
      .find({ userId })
      .select("validFrom hourlyRate")
      .lean()
      .exec();
    const current = latestRate(rates, swedishToday());
    if (current != null) {
      await this.userModel
        .updateOne({ _id: userId }, { $set: { hourlyRate: current } })
        .exec();
    }
  }

  // ---- Helpers -------------------------------------------------------------

  private async publishedVersion(id: string) {
    const version = await this.ruleSetModel.findById(id).lean().exec();
    if (!version || version.status !== AgreementRuleSetStatus.Published) {
      throw new NotFoundException("Published agreement version not found");
    }
    if (!version.wageRaiseKind || !(Number(version.wageRaiseValue) > 0)) {
      throw new BadRequestException("This agreement version has no wage raise");
    }
    return version;
  }

  private async companyWorker(userId: string, user: AuthUser) {
    const companyId = this.resolveCompanyId(user);
    const worker = await this.userModel
      .findOne({ _id: userId, companyId })
      .select("hourlyRate companyId")
      .lean()
      .exec();
    if (!worker)
      throw new NotFoundException("Worker not found in your company");
    return worker;
  }

  private resolveCompanyId(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return user.companyId;
  }
}
