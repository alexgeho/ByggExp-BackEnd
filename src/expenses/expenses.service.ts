import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UserRole } from "../users/schemas/user.schema";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { UpdateExpenseDto } from "./dto/update-expense.dto";
import {
  Expense,
  ExpenseDocument,
  ExpenseStatus,
} from "./schemas/expense.schema";

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
  _id?: string;
};

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const ADMIN_ROLES = [
  UserRole.SuperAdmin,
  UserRole.CompanyAdmin,
  UserRole.ProjectAdmin,
];

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    @InjectModel(Expense.name) private model: Model<ExpenseDocument>,
  ) {}

  private isAdmin(user: AuthUser) {
    return ADMIN_ROLES.includes(user.role);
  }

  private userId(user: AuthUser) {
    return String(user.userId || user._id || "");
  }

  private resolveCompanyId(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return user.companyId;
  }

  async create(dto: CreateExpenseDto, user: AuthUser) {
    const companyId = this.resolveCompanyId(user);
    const doc = new this.model({
      ...dto,
      companyId,
      userId: this.userId(user),
      projectId: dto.projectId || null,
      amount: round2(dto.amount ?? 0),
      vat: round2(dto.vat ?? 0),
      status: dto.status || ExpenseStatus.Submitted,
    });
    return doc.save();
  }

  async findAll(
    user: AuthUser,
    filters: { projectId?: string; status?: string } = {},
  ) {
    if (!user.companyId) {
      return [];
    }
    const filter: Record<string, unknown> = { companyId: user.companyId };
    if (filters.projectId) {
      filter.projectId = filters.projectId;
    }
    if (filters.status) {
      filter.status = filters.status;
    }
    // Workers only see their own receipts; admins see the whole company.
    if (!this.isAdmin(user)) {
      filter.userId = this.userId(user);
    }
    return this.model.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string, user: AuthUser) {
    const doc = await this.model.findById(id).exec();
    if (!doc) {
      throw new NotFoundException(`Expense "${id}" not found`);
    }
    this.assertCanAccess(doc, user);
    return doc;
  }

  async update(id: string, dto: UpdateExpenseDto, user: AuthUser) {
    const doc = await this.findOne(id, user);
    this.assertCanModify(doc, user);
    const next: Record<string, unknown> = { ...dto };
    if (dto.amount !== undefined) next.amount = round2(dto.amount);
    if (dto.vat !== undefined) next.vat = round2(dto.vat);
    if (dto.projectId !== undefined) next.projectId = dto.projectId || null;
    // Never let a worker relabel their own expense as approved via update.
    if (!this.isAdmin(user)) {
      delete next.status;
    }
    Object.assign(doc, next, {
      companyId: doc.companyId,
      userId: doc.userId,
    });
    await doc.save();
    return doc;
  }

  // Append extra files to an expense (kept alongside the primary receipt).
  async addAttachments(id: string, urls: string[], user: AuthUser) {
    const doc = await this.findOne(id, user);
    this.assertCanModify(doc, user);
    const clean = (urls || []).map(String).filter(Boolean);
    doc.attachments = [...(doc.attachments || []), ...clean];
    await doc.save();
    return doc;
  }

  // Remove one attached file (the primary receipt or an extra) and delete it
  // from disk (best-effort, guarded to stay inside ./uploads).
  async removeAttachment(id: string, url: string, user: AuthUser) {
    const doc = await this.findOne(id, user);
    this.assertCanModify(doc, user);
    const target = String(url || "");
    if (!target) throw new BadRequestException("No file specified");
    let matched = false;
    if (doc.receiptUrl === target) {
      doc.receiptUrl = null;
      matched = true;
    }
    const before = (doc.attachments || []).length;
    doc.attachments = (doc.attachments || []).filter((u) => u !== target);
    if (doc.attachments.length !== before) matched = true;
    if (matched) {
      this.deleteUploadFile(target);
      await doc.save();
    }
    return doc;
  }

  private deleteUploadFile(url: string): void {
    try {
      const uploadsRoot = path.join(process.cwd(), "uploads");
      const abs = path.join(process.cwd(), String(url).replace(/^\/+/, ""));
      if (!abs.startsWith(uploadsRoot)) return;
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch (error) {
      this.logger.warn(
        `Could not delete receipt file ${url}: ${(error as Error)?.message}`,
      );
    }
  }

  async setStatus(id: string, user: AuthUser, status: ExpenseStatus) {
    const doc = await this.findOne(id, user);
    doc.status = status;
    if (status === ExpenseStatus.Approved) {
      doc.approvedAt = doc.approvedAt || new Date();
    } else if (status === ExpenseStatus.Submitted) {
      doc.approvedAt = null;
    }
    await doc.save();
    return doc;
  }

  async remove(id: string, user: AuthUser) {
    const doc = await this.findOne(id, user);
    this.assertCanModify(doc, user);
    await this.model.findByIdAndDelete(id).exec();
    return doc;
  }

  // Every expense that isn't rejected counts as ex-VAT project cost — a logged
  // expense (incl. subcontractors / underentreprenör) flows into the project's
  // material cost immediately, without waiting for a separate approval step.
  // Only explicitly rejected expenses are left out.
  async projectSummary(projectId: string, user: AuthUser) {
    if (!user.companyId) {
      return { total: 0, count: 0, pendingCount: 0, reimburseDue: 0 };
    }
    const docs = await this.model
      .find({ companyId: user.companyId, projectId })
      .select("amount vat status paidBy")
      .lean()
      .exec();
    const counted = docs.filter(
      (d) => d.status !== ExpenseStatus.Rejected,
    );
    const total = counted.reduce(
      (s, d) => s + ((d.amount || 0) - (d.vat || 0)),
      0,
    );
    // Own-money, approved-but-not-yet-reimbursed → owed back to the worker.
    const reimburseDue = docs
      .filter((d) => d.paidBy === "own" && d.status === ExpenseStatus.Approved)
      .reduce((s, d) => s + (d.amount || 0), 0);
    return {
      total: round2(total),
      count: counted.length,
      pendingCount: docs.filter((d) => d.status === ExpenseStatus.Submitted)
        .length,
      reimburseDue: round2(reimburseDue),
    };
  }

  private assertCanAccess(doc: ExpenseDocument, user: AuthUser) {
    if (!user.companyId || String(doc.companyId) !== String(user.companyId)) {
      throw new ForbiddenException("You do not have access to this expense");
    }
    if (!this.isAdmin(user) && String(doc.userId) !== this.userId(user)) {
      throw new ForbiddenException("You do not have access to this expense");
    }
  }

  private assertCanModify(doc: ExpenseDocument, user: AuthUser) {
    if (this.isAdmin(user)) return;
    // A worker may only touch their own, still-submitted receipt.
    if (String(doc.userId) !== this.userId(user)) {
      throw new ForbiddenException("You can only edit your own expenses");
    }
    if (doc.status !== ExpenseStatus.Submitted) {
      throw new ForbiddenException(
        "This expense has been reviewed and can no longer be changed",
      );
    }
  }
}
