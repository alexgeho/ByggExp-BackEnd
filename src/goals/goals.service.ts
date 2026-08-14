import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Goal, GoalDocument } from "./schemas/goal.schema";
import { Project, ProjectDocument } from "../projects/schemas/project.schema";
import { UpdateGoalDto } from "./dto/update-goal.dto";
import { UserRole } from "../users/schemas/user.schema";

@Injectable()
export class GoalsService {
  constructor(
    @InjectModel(Goal.name)
    private readonly goalModel: Model<GoalDocument>,
    @InjectModel(Project.name)
    private readonly projectModel: Model<ProjectDocument>,
  ) {}

  private async assertProjectInCompany(
    projectId: string,
    companyId?: string,
    role?: string,
  ): Promise<void> {
    const project = await this.projectModel
      .findById(projectId)
      .select("companyId")
      .lean<{ companyId?: string }>()
      .exec();
    if (!project) {
      throw new NotFoundException("Project not found");
    }
    if (
      role !== UserRole.SuperAdmin &&
      companyId &&
      String(project.companyId) !== String(companyId)
    ) {
      throw new ForbiddenException("Project belongs to another company");
    }
  }

  // Return the project's goal, creating an empty one on first access so the
  // client always has a document to edit.
  async getByProject(projectId: string, companyId?: string, role?: string) {
    await this.assertProjectInCompany(projectId, companyId, role);

    let goal = await this.goalModel.findOne({ projectId }).exec();
    if (!goal) {
      goal = await this.goalModel.create({
        companyId,
        projectId,
        title: "",
        stages: [],
      });
    }
    return goal;
  }

  async update(
    projectId: string,
    dto: UpdateGoalDto,
    companyId?: string,
    role?: string,
  ) {
    await this.assertProjectInCompany(projectId, companyId, role);

    const goal = await this.goalModel.findOne({ projectId }).exec();
    const stages = (dto.stages ?? []).map((stage, index) => ({
      title: stage.title ?? "",
      taskIds: Array.isArray(stage.taskIds)
        ? stage.taskIds.map((id) => String(id))
        : [],
      order: typeof stage.order === "number" ? stage.order : index,
    }));

    if (!goal) {
      return this.goalModel.create({
        companyId,
        projectId,
        title: dto.title ?? "",
        stages,
      });
    }

    if (dto.title !== undefined) {
      goal.title = dto.title;
    }
    if (dto.stages !== undefined) {
      goal.set("stages", stages);
    }
    await goal.save();
    return goal;
  }
}
