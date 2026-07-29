import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { randomBytes } from "crypto";
import { Tool, ToolDocument } from "./schemas/tool.schema";
import {
  ToolEvent,
  ToolEventDocument,
  ToolEventType,
} from "./schemas/tool-event.schema";
import { CreateToolDto } from "./dto/create-tool.dto";
import { UpdateToolDto } from "./dto/update-tool.dto";
import { HandoffToolDto, InspectToolDto } from "./dto/tool-action.dto";
import { Project, ProjectDocument } from "../projects/schemas/project.schema";
import { UserRole } from "../users/schemas/user.schema";

type AuthUser = {
  role: UserRole;
  companyId?: string;
  userId?: string;
};

@Injectable()
export class ToolsService {
  constructor(
    @InjectModel(Tool.name) private toolModel: Model<ToolDocument>,
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectModel(ToolEvent.name)
    private eventModel: Model<ToolEventDocument>,
  ) {}

  // Short, human-typeable label code (avoids ambiguous chars).
  private async generateQrId(): Promise<string> {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let attempt = 0; attempt < 8; attempt++) {
      const bytes = randomBytes(6);
      let code = "";
      for (let i = 0; i < 6; i++) code += alphabet[bytes[i] % alphabet.length];
      const qrId = `TL-${code}`;
      const clash = await this.toolModel.exists({ qrId });
      if (!clash) return qrId;
    }
    return `TL-${Date.now().toString(36).toUpperCase()}`;
  }

  async create(createToolDto: CreateToolDto, user?: AuthUser): Promise<Tool> {
    const payload: CreateToolDto & { qrId?: string } = {
      ...createToolDto,
      workerIds: createToolDto.workerIds || [],
      projectIds: createToolDto.projectIds || [],
    };

    this.syncPhotoFields(payload);

    // Non-superadmin tools always belong to the caller's own company; any
    // companyId supplied in the body is ignored (anti cross-tenant tampering).
    if (user) {
      if (!user.companyId) {
        throw new ForbiddenException(
          "Your account is not attached to a company",
        );
      }
      payload.companyId = user.companyId;
    }

    payload.qrId = await this.generateQrId();

    const tool = await new this.toolModel(payload).save();
    if (tool.companyId) {
      await this.logEvent(tool, ToolEventType.Created, user, {});
    }
    return tool;
  }

  // ---- QR + hand-off + inspection ----

  async findByQr(qrId: string, user: AuthUser): Promise<ToolDocument> {
    const tool = await this.toolModel.findOne({ qrId }).exec();
    if (!tool) {
      throw new NotFoundException(`No tool with code "${qrId}"`);
    }
    if (!user.companyId || String(tool.companyId) !== String(user.companyId)) {
      throw new ForbiddenException("You do not have access to this tool");
    }
    return tool;
  }

  async handoff(
    id: string,
    dto: HandoffToolDto,
    user: AuthUser,
  ): Promise<ToolDocument> {
    const tool = await this.assertToolAccessById(id, user);
    const fromUserId = tool.currentHolderId || null;
    const toUserId = dto.toUserId || null;

    tool.currentHolderId = toUserId;
    if (dto.location !== undefined) tool.location = dto.location;
    if (toUserId) {
      // Reflect the responsible person in the existing assignment array too.
      tool.workerIds = [toUserId];
      tool.status = "occupied";
    } else {
      tool.workerIds = [];
      if (tool.status === "occupied") tool.status = "available";
    }
    if (dto.projectId) {
      tool.projectIds = [dto.projectId];
    }
    await tool.save();

    await this.logEvent(
      tool,
      toUserId ? ToolEventType.Handoff : ToolEventType.Returned,
      user,
      {
        fromUserId,
        toUserId,
        projectId: dto.projectId || null,
        note: dto.note || "",
      },
    );
    return tool;
  }

  async inspect(
    id: string,
    dto: InspectToolDto,
    user: AuthUser,
  ): Promise<ToolDocument> {
    const tool = await this.assertToolAccessById(id, user);
    const condition = dto.condition || "ok";
    tool.lastInspectionDate = new Date().toISOString().slice(0, 10);
    if (dto.nextInspectionDate !== undefined) {
      tool.nextInspectionDate = dto.nextInspectionDate;
    }
    if (condition === "broken") tool.status = "broken";
    else if (condition === "needs_service") tool.status = "in_repair";
    await tool.save();

    await this.logEvent(tool, ToolEventType.Inspection, user, {
      condition,
      note: dto.note || "",
    });
    return tool;
  }

  // Assign (or reuse) a QR code — for tools created before QR support.
  async ensureQr(id: string, user: AuthUser): Promise<ToolDocument> {
    const tool = await this.assertToolAccessById(id, user);
    if (!tool.qrId) {
      tool.qrId = await this.generateQrId();
      await tool.save();
    }
    return tool;
  }

  async history(id: string, user: AuthUser): Promise<ToolEvent[]> {
    await this.assertToolAccessById(id, user);
    return this.eventModel.find({ toolId: id }).sort({ createdAt: -1 }).exec();
  }

  private async logEvent(
    tool: ToolDocument,
    type: ToolEventType,
    user: AuthUser | undefined,
    data: Partial<ToolEvent>,
  ): Promise<void> {
    await this.eventModel.create({
      toolId: String(tool._id),
      companyId: String(tool.companyId),
      type,
      byUserId: user?.userId || null,
      ...data,
    });
  }

  // ---- Tenant access control ----

  async assertToolAccessById(
    id: string,
    user: AuthUser,
  ): Promise<ToolDocument> {
    const tool = await this.toolModel.findById(id).exec();
    if (!tool) {
      throw new NotFoundException(`Tool with ID "${id}" not found`);
    }
    if (!user.companyId || String(tool.companyId) !== String(user.companyId)) {
      throw new ForbiddenException("You do not have access to this tool");
    }
    return tool;
  }

  async assertToolsInCompany(toolIds: string[], user: AuthUser): Promise<void> {
    if (!toolIds?.length) {
      return;
    }
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    const owned = await this.toolModel
      .countDocuments({ _id: { $in: toolIds }, companyId: user.companyId })
      .exec();
    if (owned !== new Set(toolIds).size) {
      throw new ForbiddenException(
        "One or more tools are outside your company",
      );
    }
  }

  async findAccessible(user: AuthUser): Promise<Tool[]> {
    // Superadmin is scoped to its own company like a company admin.
    if (
      (user.role === UserRole.CompanyAdmin ||
        user.role === UserRole.SuperAdmin) &&
      user.companyId
    ) {
      const companyProjects = await this.projectModel
        .find({ companyId: user.companyId })
        .select("_id")
        .lean()
        .exec();
      const projectIds = companyProjects.map((project) =>
        project._id.toString(),
      );

      return this.toolModel
        .find({
          $or: [
            { companyId: user.companyId },
            { projectIds: { $in: projectIds } },
          ],
        })
        .sort({ createdAt: -1 })
        .exec();
    }

    const projectFilter = this.getProjectFilterForUser(user);
    const projects = await this.projectModel
      .find(projectFilter)
      .select("_id")
      .lean()
      .exec();
    const projectIds = projects.map((project) => project._id.toString());

    if (!projectIds.length && user.role !== UserRole.Worker) {
      return [];
    }

    const accessFilter: Record<string, unknown>[] = [];

    if (projectIds.length) {
      accessFilter.push({ projectIds: { $in: projectIds } });
    }

    if (user.role === UserRole.Worker && user.userId) {
      accessFilter.push({ workerIds: user.userId });
    }

    if (!accessFilter.length) {
      return [];
    }

    return this.toolModel
      .find({ $or: accessFilter })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<Tool> {
    const tool = await this.toolModel.findById(id).exec();

    if (!tool) {
      throw new NotFoundException(`Tool with ID "${id}" not found`);
    }

    return tool;
  }

  async update(id: string, updateToolDto: UpdateToolDto): Promise<Tool> {
    const tool = await this.toolModel.findById(id).exec();

    if (!tool) {
      throw new NotFoundException(`Tool with ID "${id}" not found`);
    }

    const definedUpdates = Object.fromEntries(
      Object.entries(updateToolDto).filter(([, value]) => value !== undefined),
    );

    Object.assign(tool, definedUpdates);
    this.syncPhotoFields(tool);
    await tool.save();

    return tool;
  }

  async remove(id: string): Promise<Tool> {
    const tool = await this.toolModel.findById(id).exec();

    if (!tool) {
      throw new NotFoundException(`Tool with ID "${id}" not found`);
    }

    await this.toolModel.findByIdAndDelete(id).exec();

    return tool;
  }

  async attachToWorker(
    workerId: string,
    toolIds: string[],
    companyId: string,
  ): Promise<void> {
    if (!toolIds.length) {
      return;
    }

    await this.toolModel.updateMany(
      { _id: { $in: toolIds }, companyId },
      { $addToSet: { workerIds: workerId } },
    );
  }

  async replaceWorkerAssignments(
    workerId: string,
    toolIds: string[],
    companyId: string,
  ): Promise<void> {
    // Company-scope the clear so passing another company's workerId can never
    // strip that worker off *their* tools.
    await this.toolModel.updateMany(
      { workerIds: workerId, companyId },
      { $pull: { workerIds: workerId } },
    );

    if (!toolIds.length) {
      return;
    }

    await this.toolModel.updateMany(
      { _id: { $in: toolIds }, companyId },
      { $addToSet: { workerIds: workerId } },
    );
  }

  async attachToProject(
    projectId: string,
    toolIds: string[],
    companyId: string,
  ): Promise<void> {
    if (!toolIds.length) {
      return;
    }

    await this.toolModel.updateMany(
      { _id: { $in: toolIds }, companyId },
      { $addToSet: { projectIds: projectId } },
    );
  }

  private getProjectFilterForUser(user: AuthUser) {
    if (user.role === UserRole.ProjectAdmin && user.userId) {
      return { projectAdmins: user.userId };
    }

    if (user.role === UserRole.Worker && user.userId) {
      return { workers: user.userId };
    }

    return {};
  }

  private syncPhotoFields(payload: {
    photoUrl?: string;
    photoUrls?: string[];
  }) {
    const photoUrls = Array.isArray(payload.photoUrls)
      ? payload.photoUrls.filter(Boolean)
      : [];

    if (photoUrls.length) {
      payload.photoUrls = photoUrls;
      payload.photoUrl = photoUrls[0];
      return;
    }

    if (payload.photoUrl) {
      payload.photoUrls = [payload.photoUrl];
      return;
    }

    payload.photoUrls = [];
    payload.photoUrl = "";
  }
}
