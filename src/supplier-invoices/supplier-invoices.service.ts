import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import { NotificationsService } from "../notifications/notifications.service";
import { CreateSupplierInvoiceDto } from "./dto/create-supplier-invoice.dto";
import {
  SupplierInvoice,
  SupplierInvoiceDocument,
  SupplierInvoiceStatus,
} from "./schemas/supplier-invoice.schema";

const DAY_MS = 86400000;
const addDays = (iso: string, days: number): string => {
  const d = new Date(iso);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
};

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
};

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

@Injectable()
export class SupplierInvoicesService {
  private readonly logger = new Logger(SupplierInvoicesService.name);

  constructor(
    @InjectModel(SupplierInvoice.name)
    private model: Model<SupplierInvoiceDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private readonly notifications: NotificationsService,
  ) {}

  // Daily heads-up so a supplier bill never slips into inkasso: push the company
  // admins when an unpaid invoice is due today or in exactly `lead` days. Two
  // stateless touch-points (lead + due day) — no per-invoice flag, no spam.
  // Fully inert unless PAYMENT_REMINDERS_ENABLED=true (and only sends where the
  // admins have a mobile push token).
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async remindUpcomingPayments(): Promise<void> {
    if (process.env.PAYMENT_REMINDERS_ENABLED !== "true") return;
    const lead = Math.max(
      0,
      Number(process.env.PAYMENT_REMINDER_LEAD_DAYS ?? 3) || 0,
    );
    const today = new Date().toISOString().slice(0, 10);
    const leadDay = addDays(today, lead);

    const due = await this.model
      .find({
        status: { $ne: SupplierInvoiceStatus.Paid },
        dueDate: { $in: [today, leadDay] },
      })
      .lean()
      .exec();
    if (!due.length) return;

    // Group by company so each admin gets one summary.
    const byCompany = new Map<string, typeof due>();
    for (const inv of due) {
      const key = String(inv.companyId);
      if (!byCompany.has(key)) byCompany.set(key, []);
      byCompany.get(key)!.push(inv);
    }

    for (const [companyId, invoices] of byCompany) {
      const admins = await this.userModel
        .find({ companyId, role: UserRole.CompanyAdmin })
        .select("_id")
        .lean()
        .exec();
      if (!admins.length) continue;

      const total = invoices.reduce((s, i) => s + (Number(i.total) || 0), 0);
      const n = invoices.length;
      try {
        await this.notifications.sendToUsers(
          admins.map((a) => String(a._id)),
          {
            title: "Betalning förfaller",
            body:
              n === 1
                ? `Leverantörsfaktura till ${invoices[0].supplierName || "leverantör"} förfaller (${Math.round(total)} kr).`
                : `${n} leverantörsfakturor förfaller snart (${Math.round(total)} kr).`,
            data: { type: "payment_due", screen: "SupplierInvoices" },
          },
        );
      } catch (error) {
        this.logger.warn(
          `Payment reminder push failed for company ${companyId}: ${(error as Error)?.message}`,
        );
      }
    }
  }

  private resolveCompanyId(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return user.companyId;
  }

  private computeTotal(dto: CreateSupplierInvoiceDto): number {
    if (dto.total !== undefined && dto.total !== null) {
      return round2(dto.total);
    }
    return round2((Number(dto.amountExclVat) || 0) + (Number(dto.vat) || 0));
  }

  async create(dto: CreateSupplierInvoiceDto, user: AuthUser) {
    const companyId = this.resolveCompanyId(user);
    const doc = new this.model({
      ...dto,
      companyId,
      projectId: dto.projectId || null,
      amountExclVat: round2(dto.amountExclVat ?? 0),
      vat: round2(dto.vat ?? 0),
      total: this.computeTotal(dto),
      status: dto.status || SupplierInvoiceStatus.Registered,
      createdByUserId: user.userId || null,
    });
    return doc.save();
  }

  async findAll(user: AuthUser, projectId?: string) {
    if (!user.companyId) {
      return [];
    }
    const filter: Record<string, unknown> = { companyId: user.companyId };
    if (projectId) {
      filter.projectId = projectId;
    }
    return this.model.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string, user: AuthUser) {
    const doc = await this.model.findById(id).exec();
    if (!doc) {
      throw new NotFoundException(`Supplier invoice "${id}" not found`);
    }
    this.assertCanAccess(doc, user);
    return doc;
  }

  async update(id: string, dto: CreateSupplierInvoiceDto, user: AuthUser) {
    const doc = await this.findOne(id, user);
    Object.assign(doc, {
      ...dto,
      companyId: doc.companyId,
      projectId: dto.projectId ?? doc.projectId ?? null,
      amountExclVat: round2(dto.amountExclVat ?? doc.amountExclVat),
      vat: round2(dto.vat ?? doc.vat),
      total: this.computeTotal({
        total: dto.total,
        amountExclVat: dto.amountExclVat ?? doc.amountExclVat,
        vat: dto.vat ?? doc.vat,
      }),
    });
    await doc.save();
    return doc;
  }

  async setStatus(id: string, user: AuthUser, status: SupplierInvoiceStatus) {
    const doc = await this.findOne(id, user);
    doc.status = status;
    if (status === SupplierInvoiceStatus.Approved) {
      doc.approvedAt = doc.approvedAt || new Date();
    } else if (status === SupplierInvoiceStatus.Paid) {
      doc.approvedAt = doc.approvedAt || new Date();
      doc.paidAt = doc.paidAt || new Date();
    } else if (status === SupplierInvoiceStatus.Registered) {
      doc.approvedAt = null;
      doc.paidAt = null;
    }
    await doc.save();
    return doc;
  }

  async remove(id: string, user: AuthUser) {
    const doc = await this.findOne(id, user);
    await this.model.findByIdAndDelete(id).exec();
    return doc;
  }

  // Total supplier cost booked against one project (for its economy view).
  async projectSummary(projectId: string, user: AuthUser) {
    if (!user.companyId) {
      return { totalExclVat: 0, total: 0, count: 0 };
    }
    const docs = await this.model
      .find({ companyId: user.companyId, projectId })
      .select("amountExclVat total")
      .lean()
      .exec();
    return {
      totalExclVat: round2(
        docs.reduce((s, d) => s + (d.amountExclVat || 0), 0),
      ),
      total: round2(docs.reduce((s, d) => s + (d.total || 0), 0)),
      count: docs.length,
    };
  }

  private assertCanAccess(doc: SupplierInvoiceDocument, user: AuthUser) {
    if (!user.companyId || String(doc.companyId) !== String(user.companyId)) {
      throw new ForbiddenException(
        "You do not have access to this supplier invoice",
      );
    }
  }
}
