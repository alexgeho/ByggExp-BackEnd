import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UserRole } from "../users/schemas/user.schema";
import { CreateDagbokDto } from "./dto/create-dagbok.dto";
import { UpdateDagbokDto } from "./dto/update-dagbok.dto";
import { DagbokDocument, DagbokEntry } from "./schemas/dagbok.schema";

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
  _id?: string;
};

@Injectable()
export class DagbokService {
  constructor(
    @InjectModel(DagbokEntry.name) private model: Model<DagbokDocument>,
  ) {}

  private resolveCompanyId(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return user.companyId;
  }

  async create(dto: CreateDagbokDto, user: AuthUser) {
    const companyId = this.resolveCompanyId(user);
    const doc = new this.model({
      ...dto,
      companyId,
      photoUrls: dto.photoUrls || [],
      createdByUserId: user.userId || user._id || null,
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
    return this.model.find(filter).sort({ date: -1, createdAt: -1 }).exec();
  }

  async findOne(id: string, user: AuthUser) {
    const doc = await this.model.findById(id).exec();
    if (!doc) {
      throw new NotFoundException(`Dagbok entry "${id}" not found`);
    }
    this.assertCanAccess(doc, user);
    return doc;
  }

  async update(id: string, dto: UpdateDagbokDto, user: AuthUser) {
    const doc = await this.findOne(id, user);
    Object.assign(doc, dto, {
      companyId: doc.companyId,
      projectId: doc.projectId,
    });
    await doc.save();
    return doc;
  }

  async addPhoto(id: string, user: AuthUser, url: string) {
    const doc = await this.findOne(id, user);
    doc.photoUrls = [...(doc.photoUrls || []), url];
    await doc.save();
    return doc;
  }

  async remove(id: string, user: AuthUser) {
    const doc = await this.findOne(id, user);
    await this.model.findByIdAndDelete(id).exec();
    return doc;
  }

  private assertCanAccess(doc: DagbokDocument, user: AuthUser) {
    if (!user.companyId || String(doc.companyId) !== String(user.companyId)) {
      throw new ForbiddenException(
        "You do not have access to this diary entry",
      );
    }
  }
}
