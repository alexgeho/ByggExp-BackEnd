import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UserRole } from "../users/schemas/user.schema";
import { CreateSupplierInvoiceDto } from "./dto/create-supplier-invoice.dto";
import {
  SupplierInvoice,
  SupplierInvoiceDocument,
  SupplierInvoiceStatus,
} from "./schemas/supplier-invoice.schema";

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
};

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

@Injectable()
export class SupplierInvoicesService {
  constructor(
    @InjectModel(SupplierInvoice.name)
    private model: Model<SupplierInvoiceDocument>,
  ) {}

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
