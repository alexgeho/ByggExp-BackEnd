import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UserRole } from "../users/schemas/user.schema";
import {
  CreatePaymentPlanDto,
  SetRowStatusDto,
  UpdatePaymentPlanDto,
} from "./dto/payment-plan.dto";
import {
  PaymentPlan,
  PaymentPlanDocument,
  PaymentPlanRowStatus,
} from "./schemas/payment-plan.schema";

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
};

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// Effective ex-VAT amount of a row: explicit amount, else percent of contract.
export const rowAmount = (
  row: { amount?: number; percent?: number },
  contractAmount: number,
) => {
  if (row.amount) return round2(row.amount);
  if (row.percent) return round2((row.percent / 100) * (contractAmount || 0));
  return 0;
};

@Injectable()
export class PaymentPlansService {
  constructor(
    @InjectModel(PaymentPlan.name) private model: Model<PaymentPlanDocument>,
  ) {}

  private companyId(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return user.companyId;
  }

  async findAll(user: AuthUser, projectId?: string) {
    if (!user.companyId) return [];
    const filter: Record<string, unknown> = { companyId: user.companyId };
    if (projectId) filter.projectId = projectId;
    return this.model.find(filter).sort({ createdAt: -1 }).exec();
  }

  async create(dto: CreatePaymentPlanDto, user: AuthUser) {
    const companyId = this.companyId(user);
    const doc = new this.model({
      ...dto,
      companyId,
      rows: dto.rows || [],
      createdByUserId: user.userId || null,
    });
    return doc.save();
  }

  async findOne(id: string, user: AuthUser) {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException("Payment plan not found");
    this.assertCompany(doc.companyId, user);
    return doc;
  }

  async update(id: string, dto: UpdatePaymentPlanDto, user: AuthUser) {
    const doc = await this.findOne(id, user);
    Object.assign(doc, dto, {
      companyId: doc.companyId,
      projectId: doc.projectId,
    });
    await doc.save();
    return doc;
  }

  async remove(id: string, user: AuthUser) {
    const doc = await this.findOne(id, user);
    await this.model.findByIdAndDelete(id).exec();
    return doc;
  }

  async setRowStatus(
    id: string,
    rowIndex: number,
    dto: SetRowStatusDto,
    user: AuthUser,
  ) {
    const doc = await this.findOne(id, user);
    const row = doc.rows[rowIndex];
    if (!row) throw new BadRequestException("Row not found");
    row.status = dto.status;
    if (dto.status === PaymentPlanRowStatus.Invoiced) {
      if (dto.invoiceNumber != null) row.invoiceNumber = dto.invoiceNumber;
    } else {
      row.invoiceNumber = null;
    }
    doc.markModified("rows");
    await doc.save();
    return doc;
  }

  // Aggregate across all of a project's plans for the economy view.
  async projectSummary(projectId: string, user: AuthUser) {
    if (!user.companyId) {
      return { plannedTotal: 0, invoicedTotal: 0, remaining: 0, rowCount: 0 };
    }
    const plans = await this.model
      .find({ companyId: user.companyId, projectId })
      .lean()
      .exec();
    let plannedTotal = 0;
    let invoicedTotal = 0;
    let rowCount = 0;
    for (const plan of plans) {
      for (const row of plan.rows || []) {
        const amount = rowAmount(row, plan.contractAmount || 0);
        plannedTotal += amount;
        rowCount += 1;
        if (row.status === PaymentPlanRowStatus.Invoiced) {
          invoicedTotal += amount;
        }
      }
    }
    return {
      plannedTotal: round2(plannedTotal),
      invoicedTotal: round2(invoicedTotal),
      remaining: round2(plannedTotal - invoicedTotal),
      rowCount,
    };
  }

  private assertCompany(companyId: string, user: AuthUser) {
    if (!user.companyId || String(companyId) !== String(user.companyId)) {
      throw new ForbiddenException(
        "You do not have access to this payment plan",
      );
    }
  }
}
