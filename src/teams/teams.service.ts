import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Team, TeamDocument } from "./schemas/team.schema";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import { CreateTeamDto, UpdateTeamDto } from "./dto/team.dto";

type AuthUser = {
  role?: UserRole;
  companyId?: string | null;
  userId?: string;
};

@Injectable()
export class TeamsService {
  constructor(
    @InjectModel(Team.name) private teamModel: Model<TeamDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  private requireCompany(actor?: AuthUser): string {
    if (!actor?.companyId) {
      throw new ForbiddenException("No company context for this request");
    }
    return String(actor.companyId);
  }

  // Keep only member ids that actually belong to this company (drops stale or
  // cross-tenant ids defensively).
  private async sanitizeMembers(
    memberIds: string[] | undefined,
    companyId: string,
  ): Promise<string[]> {
    const ids = [...new Set((memberIds ?? []).map((id) => String(id)))];
    if (!ids.length) return [];
    const users = await this.userModel
      .find({ _id: { $in: ids }, companyId })
      .select("_id")
      .lean()
      .exec();
    const valid = new Set(users.map((u) => String(u._id)));
    return ids.filter((id) => valid.has(id));
  }

  async findAll(actor: AuthUser): Promise<Team[]> {
    const companyId = this.requireCompany(actor);
    return this.teamModel.find({ companyId }).sort({ name: 1 }).lean().exec();
  }

  async create(dto: CreateTeamDto, actor: AuthUser): Promise<Team> {
    const companyId = this.requireCompany(actor);
    const memberIds = await this.sanitizeMembers(dto.memberIds, companyId);
    return new this.teamModel({
      companyId,
      name: dto.name.trim(),
      memberIds,
      createdByUserId: actor.userId ?? null,
    }).save();
  }

  async update(
    id: string,
    dto: UpdateTeamDto,
    actor: AuthUser,
  ): Promise<Team> {
    const companyId = this.requireCompany(actor);
    const team = await this.teamModel.findById(id).exec();
    if (!team) throw new NotFoundException(`Team "${id}" not found`);
    if (String(team.companyId) !== companyId) {
      throw new ForbiddenException("Team belongs to another company");
    }
    if (dto.name !== undefined) team.name = dto.name.trim();
    if (dto.memberIds !== undefined) {
      team.memberIds = await this.sanitizeMembers(dto.memberIds, companyId);
    }
    await team.save();
    return team;
  }

  async remove(id: string, actor: AuthUser): Promise<{ ok: true }> {
    const companyId = this.requireCompany(actor);
    const team = await this.teamModel.findById(id).exec();
    if (!team) throw new NotFoundException(`Team "${id}" not found`);
    if (String(team.companyId) !== companyId) {
      throw new ForbiddenException("Team belongs to another company");
    }
    await team.deleteOne();
    return { ok: true };
  }
}
