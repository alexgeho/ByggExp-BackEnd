import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UserRole } from "../users/schemas/user.schema";
import {
  Projektkalkyl,
  ProjektkalkylDocument,
} from "./schemas/projektkalkyl.schema";
import {
  CreateProjektkalkylDto,
  UpdateProjektkalkylDto,
} from "./dto/projektkalkyl.dto";

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
};

@Injectable()
export class ProjektkalkylService {
  constructor(
    @InjectModel(Projektkalkyl.name)
    private model: Model<ProjektkalkylDocument>,
  ) {}

  private companyOf(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return user.companyId;
  }

  async findAccessible(user: AuthUser): Promise<Projektkalkyl[]> {
    if (!user.companyId) return [];
    return this.model
      .find({ companyId: user.companyId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string, user: AuthUser): Promise<ProjektkalkylDocument> {
    const doc = await this.model.findById(id).exec();
    if (!doc) {
      throw new NotFoundException(`Projektkalkyl "${id}" not found`);
    }
    if (!user.companyId || String(doc.companyId) !== String(user.companyId)) {
      throw new ForbiddenException("You do not have access to this calculation");
    }
    return doc;
  }

  async create(
    dto: CreateProjektkalkylDto,
    user: AuthUser,
  ): Promise<Projektkalkyl> {
    const doc = new this.model({
      ...dto,
      name: dto.name || "Ny kalkyl",
      rows: dto.rows || [],
      companyId: this.companyOf(user),
      createdByUserId: user.userId,
    });
    return doc.save();
  }

  async update(
    id: string,
    dto: UpdateProjektkalkylDto,
    user: AuthUser,
  ): Promise<ProjektkalkylDocument> {
    const doc = await this.findOne(id, user);
    Object.assign(doc, {
      ...dto,
      companyId: doc.companyId,
      createdByUserId: doc.createdByUserId,
    });
    return doc.save();
  }

  async remove(id: string, user: AuthUser): Promise<Projektkalkyl> {
    const doc = await this.findOne(id, user);
    await this.model.findByIdAndDelete(id).exec();
    return doc;
  }
}
