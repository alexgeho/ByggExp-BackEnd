import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Assignment, AssignmentDocument } from "./schemas/assignment.schema";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import { Project, ProjectDocument } from "../projects/schemas/project.schema";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";
import { UpdateAssignmentDto } from "./dto/update-assignment.dto";

type AuthUser = {
  role?: UserRole;
  companyId?: string | null;
  userId?: string;
};

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectModel(Assignment.name)
    private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
  ) {}

  private requireCompany(actor?: AuthUser): string {
    if (!actor?.companyId) {
      throw new ForbiddenException("No company context for this request");
    }
    return String(actor.companyId);
  }

  private async assertUserInCompany(userId: string, companyId: string) {
    const user = await this.userModel
      .findById(userId)
      .select("companyId")
      .lean()
      .exec();
    if (!user) {
      throw new NotFoundException(`User "${userId}" not found`);
    }
    if (String(user.companyId ?? "") !== companyId) {
      throw new ForbiddenException("User belongs to another company");
    }
  }

  private async assertProjectInCompany(projectId: string, companyId: string) {
    const project = await this.projectModel
      .findById(projectId)
      .select("companyId")
      .lean()
      .exec();
    if (!project) {
      throw new NotFoundException(`Project "${projectId}" not found`);
    }
    if (String(project.companyId ?? "") !== companyId) {
      throw new ForbiddenException("Project belongs to another company");
    }
  }

  async findRange(
    from: string | undefined,
    to: string | undefined,
    projectId: string | undefined,
    actor: AuthUser,
  ): Promise<Assignment[]> {
    const companyId = this.requireCompany(actor);
    const query: Record<string, unknown> = { companyId };

    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.$gte = new Date(from);
      if (to) dateFilter.$lte = new Date(to);
      query.date = dateFilter;
    }
    if (projectId) {
      query.projectId = projectId;
    }
    // Workers only ever see their own assignments (their personal schedule).
    if (actor.role === UserRole.Worker && actor.userId) {
      query.userId = String(actor.userId);
    }

    return this.assignmentModel.find(query).sort({ date: 1 }).lean().exec();
  }

  async create(dto: CreateAssignmentDto, actor: AuthUser): Promise<Assignment> {
    const companyId = this.requireCompany(actor);
    await this.assertUserInCompany(dto.userId, companyId);
    await this.assertProjectInCompany(dto.projectId, companyId);

    return new this.assignmentModel({
      companyId,
      userId: dto.userId,
      projectId: dto.projectId,
      date: new Date(dto.date),
      hours: dto.hours ?? 8,
      note: dto.note ?? "",
      createdByUserId: actor.userId ?? null,
    }).save();
  }

  async update(
    id: string,
    dto: UpdateAssignmentDto,
    actor: AuthUser,
  ): Promise<Assignment> {
    const companyId = this.requireCompany(actor);
    const assignment = await this.assignmentModel.findById(id).exec();
    if (!assignment) {
      throw new NotFoundException(`Assignment "${id}" not found`);
    }
    if (String(assignment.companyId) !== companyId) {
      throw new ForbiddenException("Assignment belongs to another company");
    }

    if (dto.userId) {
      await this.assertUserInCompany(dto.userId, companyId);
      assignment.userId = dto.userId;
    }
    if (dto.projectId) {
      await this.assertProjectInCompany(dto.projectId, companyId);
      assignment.projectId = dto.projectId;
    }
    if (dto.date) {
      assignment.date = new Date(dto.date);
    }
    if (dto.hours !== undefined) {
      assignment.hours = dto.hours;
    }
    if (dto.note !== undefined) {
      assignment.note = dto.note;
    }

    return assignment.save();
  }

  async remove(id: string, actor: AuthUser): Promise<{ ok: true }> {
    const companyId = this.requireCompany(actor);
    const assignment = await this.assignmentModel.findById(id).exec();
    if (!assignment) {
      throw new NotFoundException(`Assignment "${id}" not found`);
    }
    if (String(assignment.companyId) !== companyId) {
      throw new ForbiddenException("Assignment belongs to another company");
    }
    await this.assignmentModel.findByIdAndDelete(id).exec();
    return { ok: true };
  }
}
