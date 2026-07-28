import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UserRole } from "../users/schemas/user.schema";
import { CreateAtaDto } from "./dto/create-ata.dto";
import { UpdateAtaDto } from "./dto/update-ata.dto";
import { Ata, AtaDocument, AtaStatus } from "./schemas/ata.schema";

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
};

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

@Injectable()
export class AtaService {
  constructor(@InjectModel(Ata.name) private model: Model<AtaDocument>) {}

  private resolveCompanyId(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return user.companyId;
  }

  private async nextNumber(projectId: string): Promise<number> {
    const latest = await this.model
      .findOne({ projectId })
      .sort({ number: -1 })
      .select("number")
      .lean()
      .exec();
    return (latest?.number || 0) + 1;
  }

  async create(dto: CreateAtaDto, user: AuthUser) {
    const companyId = this.resolveCompanyId(user);
    const number = await this.nextNumber(dto.projectId);
    const doc = new this.model({
      ...dto,
      companyId,
      number,
      amount: round2(dto.amount ?? 0),
      status: dto.status || AtaStatus.Registered,
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
    return this.model.find(filter).sort({ number: -1 }).exec();
  }

  async findOne(id: string, user: AuthUser) {
    const doc = await this.model.findById(id).exec();
    if (!doc) {
      throw new NotFoundException(`ÄTA "${id}" not found`);
    }
    this.assertCanAccess(doc, user);
    return doc;
  }

  async update(id: string, dto: UpdateAtaDto, user: AuthUser) {
    const doc = await this.findOne(id, user);
    Object.assign(doc, {
      ...dto,
      companyId: doc.companyId,
      projectId: doc.projectId,
      number: doc.number,
      amount: dto.amount !== undefined ? round2(dto.amount) : doc.amount,
    });
    await doc.save();
    return doc;
  }

  async setStatus(id: string, user: AuthUser, status: AtaStatus) {
    const doc = await this.findOne(id, user);
    doc.status = status;
    if (status === AtaStatus.Approved) {
      doc.approvedAt = doc.approvedAt || new Date();
    } else if (status === AtaStatus.Registered || status === AtaStatus.Sent) {
      doc.approvedAt = null;
    }
    await doc.save();
    return doc;
  }

  async remove(id: string, user: AuthUser) {
    const doc = await this.findOne(id, user);
    await this.model.findByIdAndDelete(id).exec();
    return doc;
  }

  // Approved (and invoiced) ÄTA add to the project's contract value.
  async projectSummary(projectId: string, user: AuthUser) {
    if (!user.companyId) {
      return { approvedTotal: 0, pendingTotal: 0, count: 0 };
    }
    const docs = await this.model
      .find({ companyId: user.companyId, projectId })
      .select("amount status")
      .lean()
      .exec();
    const approved = docs.filter((d) =>
      [AtaStatus.Approved, AtaStatus.Invoiced].includes(d.status),
    );
    const pending = docs.filter((d) =>
      [AtaStatus.Registered, AtaStatus.Sent].includes(d.status),
    );
    return {
      approvedTotal: round2(approved.reduce((s, d) => s + (d.amount || 0), 0)),
      pendingTotal: round2(pending.reduce((s, d) => s + (d.amount || 0), 0)),
      count: docs.length,
    };
  }

  private assertCanAccess(doc: AtaDocument, user: AuthUser) {
    if (!user.companyId || String(doc.companyId) !== String(user.companyId)) {
      throw new ForbiddenException("You do not have access to this ÄTA");
    }
  }
}
