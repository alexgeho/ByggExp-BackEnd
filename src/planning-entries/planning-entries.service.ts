import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UserRole } from "../users/schemas/user.schema";
import { CreatePlanningEntryDto } from "./dto/create-planning-entry.dto";
import {
  PlanningEntry,
  PlanningEntryDocument,
} from "./schemas/planning-entry.schema";

type AuthUser = { role: UserRole; companyId?: string | null; userId?: string };

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

@Injectable()
export class PlanningEntriesService {
  constructor(
    @InjectModel(PlanningEntry.name)
    private model: Model<PlanningEntryDocument>,
  ) {}

  private companyId(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return user.companyId;
  }

  async findAll(user: AuthUser) {
    if (!user.companyId) return [];
    return this.model.find({ companyId: user.companyId }).sort({ dueDate: 1 }).exec();
  }

  async create(dto: CreatePlanningEntryDto, user: AuthUser) {
    const companyId = this.companyId(user);
    return new this.model({
      ...dto,
      companyId,
      amount: round2(dto.amount ?? 0),
      createdByUserId: user.userId || null,
    }).save();
  }

  async remove(id: string, user: AuthUser) {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException("Planning entry not found");
    if (!user.companyId || String(doc.companyId) !== String(user.companyId)) {
      throw new ForbiddenException("You do not have access to this entry");
    }
    await this.model.findByIdAndDelete(id).exec();
    return doc;
  }
}
