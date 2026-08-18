import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { cronsDisabled } from "../common/cron.util";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Project, ProjectDocument } from "./schemas/project.schema";
import { Client, ClientDocument } from "../clients/schemas/client.schema";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UsersService } from "../users/users.service";
import { CompanyService } from "../company/company.service";
import { User, UserRole } from "../users/schemas/user.schema";

type ProjectAuthUser = {
  userId?: string;
  role?: UserRole;
  companyId?: string | null;
};

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  private isReconcilingStatuses = false;

  private readonly geocoderHeaders = {
    Accept: "application/json",
    "Accept-Language": "en",
    "User-Agent":
      process.env.GEOCODER_USER_AGENT || "ByggExp/1.0 (server geocoding proxy)",
  };

  constructor(
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectModel(Client.name) private clientModel: Model<ClientDocument>,
    private usersService: UsersService,
    private companyService: CompanyService,
  ) {}

  // Resolves an optional clientId against the project's own
  // company. Returns null when unset, or throws if the client is missing or
  // belongs to a different company (prevents cross-tenant references).
  private async resolveClientId(
    clientId: string | null | undefined,
    companyId: string,
  ): Promise<string | null> {
    if (!clientId) {
      return null;
    }

    const client = await this.clientModel.findById(clientId).exec();
    if (!client || String(client.companyId) !== String(companyId)) {
      throw new BadRequestException(
        "Selected client does not belong to this company",
      );
    }

    return String(clientId);
  }

  private getEntityId(value: unknown): string {
    if (!value) {
      return "";
    }

    if (typeof value === "string") {
      return value;
    }

    const entity = value as { _id?: unknown; id?: unknown };
    return String(entity._id ?? entity.id ?? "");
  }

  private pickUserIdByRole(users: User[], roles: UserRole[]): string {
    for (const role of roles) {
      const match = users.find((user) => user.role === role);
      const matchId = this.getEntityId(match);
      if (matchId) {
        return matchId;
      }
    }

    return "";
  }

  // ---- Tenant / project-scope access control ----
  // Mirrors the pattern used by invoices/shifts: companyId is derived from the
  // authenticated user, and every by-id access is checked against it.

  private resolveCompanyId(
    _companyId: string | undefined | null,
    user: ProjectAuthUser,
  ): string {
    // Every actor (superadmin included) is scoped to its own company.
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return String(user.companyId);
  }

  private isProjectMember(project: Project, userId?: string): boolean {
    if (!userId) {
      return false;
    }
    const uid = String(userId);
    const inList = (list?: unknown) =>
      Array.isArray(list) && list.some((m) => this.getEntityId(m) === uid);
    return (
      this.getEntityId(project.ownerId) === uid ||
      this.getEntityId(project.projectManagerId) === uid ||
      inList(project.projectAdmins) ||
      inList(project.workers)
    );
  }

  private assertCanAccessProject(
    project: Project,
    user: ProjectAuthUser,
  ): void {
    if (
      !user.companyId ||
      String(project.companyId) !== String(user.companyId)
    ) {
      throw new ForbiddenException("You do not have access to this project");
    }
    // ProjectAdmin / Worker are further limited to projects they belong to.
    if (
      (user.role === UserRole.ProjectAdmin || user.role === UserRole.Worker) &&
      !this.isProjectMember(project, user.userId)
    ) {
      throw new ForbiddenException("You do not have access to this project");
    }
  }

  async assertProjectAccessById(
    id: string,
    user: ProjectAuthUser,
  ): Promise<ProjectDocument> {
    const project = await this.projectModel.findById(id).exec();
    if (!project) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }
    this.assertCanAccessProject(project, user);
    return project;
  }

  private async fetchGeocoderJson(
    pathname: string,
    params: Record<string, string>,
  ): Promise<unknown> {
    const searchParams = new URLSearchParams(params);
    const response = await fetch(
      `https://nominatim.openstreetmap.org${pathname}?${searchParams.toString()}`,
      {
        headers: this.geocoderHeaders,
      },
    );

    if (!response.ok) {
      throw new InternalServerErrorException(
        `Geocoder request failed with status ${response.status}`,
      );
    }

    return response.json();
  }

  private formatNominatimAddressLabel(match: {
    display_name?: string;
    address?: {
      house_number?: string;
      road?: string;
      street?: string;
      pedestrian?: string;
      footway?: string;
      city?: string;
      town?: string;
      village?: string;
      municipality?: string;
      suburb?: string;
      postcode?: string;
      country?: string;
    };
  }): string {
    const address = match.address;
    if (!address) {
      return match.display_name?.trim() || "";
    }

    const houseNumber = address.house_number?.trim();
    const road = (
      address.road ||
      address.street ||
      address.pedestrian ||
      address.footway
    )?.trim();

    let streetLine = "";
    if (road && houseNumber) {
      streetLine = `${road} ${houseNumber}`;
    } else if (road) {
      streetLine = road;
    } else if (houseNumber) {
      streetLine = houseNumber;
    }

    const locality =
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.suburb;

    const parts = [
      streetLine,
      locality,
      address.postcode,
      address.country,
    ].filter(Boolean);

    if (parts.length) {
      return parts.join(", ");
    }

    return match.display_name?.trim() || "";
  }

  // Coerce a project date to a real Date or null. Empty strings, unparseable
  // values and the Unix-epoch fallback (a zeroed/missing date often lands on
  // 1970-01-01) all become null, so the DB never stores "Invalid Date" garbage
  // and the app never has to render "1/1/1970".
  private cleanProjectDate(value: unknown): Date | null {
    if (value === undefined || value === null || value === "") {
      return null;
    }
    const date = new Date(value as string | number | Date);
    if (Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1970) {
      return null;
    }
    return date;
  }

  private async resolveCreatePayload(
    createProjectDto: CreateProjectDto,
    currentUser?: {
      userId?: string;
      role?: UserRole;
      companyId?: string | null;
    },
  ): Promise<CreateProjectDto> {
    // Every actor (superadmin included) creates projects only in its own
    // company; any companyId/clientCompanyId in the body is ignored (anti-tamper).
    const companyId: string = currentUser?.companyId || "";

    if (!companyId) {
      throw new BadRequestException(
        "No company available for project creation",
      );
    }

    const company = await this.companyService.findOne(companyId);
    let candidateUsers = await this.usersService.findAllByCompany(companyId);

    if (!candidateUsers.length) {
      candidateUsers = await this.usersService.findAll();
    }

    const currentUserId = currentUser?.userId || "";
    const currentCompanyUserId = candidateUsers.find(
      (user) => this.getEntityId(user) === currentUserId,
    )
      ? currentUserId
      : "";

    const primaryCompanyAdminId =
      (Array.isArray(company.companyAdmins)
        ? company.companyAdmins.find(Boolean)
        : "") || this.pickUserIdByRole(candidateUsers, [UserRole.CompanyAdmin]);

    const fallbackOwnerId =
      primaryCompanyAdminId ||
      currentCompanyUserId ||
      this.pickUserIdByRole(candidateUsers, [UserRole.ProjectAdmin]) ||
      this.getEntityId(candidateUsers[0]);

    const fallbackProjectManagerId =
      this.pickUserIdByRole(candidateUsers, [UserRole.ProjectAdmin]) ||
      primaryCompanyAdminId ||
      currentCompanyUserId ||
      fallbackOwnerId ||
      this.getEntityId(candidateUsers[0]);

    const ownerId = createProjectDto.ownerId || fallbackOwnerId;
    const projectManagerId =
      createProjectDto.projectManagerId || fallbackProjectManagerId;

    if (!ownerId || !projectManagerId) {
      throw new BadRequestException(
        "No suitable users available to assign project ownership",
      );
    }

    const clientId = await this.resolveClientId(
      createProjectDto.clientId,
      companyId,
    );

    return {
      ...createProjectDto,
      companyId,
      clientId,
      ownerId,
      projectManagerId,
      beginningDate: this.cleanProjectDate(createProjectDto.beginningDate) ?? undefined,
      endDate: this.cleanProjectDate(createProjectDto.endDate) ?? undefined,
    };
  }

  async create(
    createProjectDto: CreateProjectDto,
    currentUser?: {
      userId?: string;
      role?: UserRole;
      companyId?: string | null;
    },
  ): Promise<Project> {
    const resolvedProjectDto = await this.resolveCreatePayload(
      createProjectDto,
      currentUser,
    );
    const createdProject = new this.projectModel(resolvedProjectDto);
    const project = await createdProject.save();

    await this.companyService.addProject(
      resolvedProjectDto.companyId!,
      project._id.toString(),
    );
    await this.usersService.addUserToProject(
      resolvedProjectDto.projectManagerId!,
      project._id.toString(),
    );

    if (resolvedProjectDto.projectAdmins) {
      for (const adminId of resolvedProjectDto.projectAdmins) {
        await this.usersService.addUserToProject(
          adminId,
          project._id.toString(),
        );
      }
    }

    return project;
  }

  async findAll(): Promise<Project[]> {
    return this.projectModel.find().exec();
  }

  async findAllByCompany(companyId: string): Promise<Project[]> {
    return this.projectModel.find({ companyId }).exec();
  }

  async findAllByUser(userId: string): Promise<Project[]> {
    const user = await this.usersService.findOne(userId);
    const userProjectIds = Array.isArray(user.projectIds)
      ? user.projectIds.filter(Boolean).map((projectId) => String(projectId))
      : [];

    return this.projectModel
      .find({
        $or: [
          { ownerId: userId },
          { projectManagerId: userId },
          { projectAdmins: userId },
          { workers: userId },
          ...(userProjectIds.length ? [{ _id: { $in: userProjectIds } }] : []),
        ],
      })
      .exec();
  }

  async findByIds(ids: string[], user?: ProjectAuthUser): Promise<Project[]> {
    const query: Record<string, unknown> = { _id: { $in: ids } };
    // Non-superadmin callers only ever get projects from their own company.
    // Superadmin is scoped to its own company like any other actor.
    if (user) {
      query.companyId = user.companyId || "__no_company__";
    }
    return this.projectModel
      .find(query)
      .select(
        "companyId ownerId projectManagerId name status location locationLatitude locationLongitude locationRadiusMeters shiftSchedule",
      )
      .exec();
  }

  async findProjectById(id: string): Promise<{
    id: string;
    name: string;
    status: string;
    companyId: string;
    location: string;
    locationLatitude?: number;
    locationLongitude?: number;
    locationRadiusMeters?: number;
    shiftSchedule?: Project["shiftSchedule"];
  } | null> {
    const project = await this.projectModel
      .findById(id)
      .select(
        "name status companyId location locationLatitude locationLongitude locationRadiusMeters shiftSchedule",
      )
      .exec();
    if (!project) return null;
    return {
      id: project._id.toString(),
      name: project.name,
      status: project.status,
      companyId: project.companyId,
      location: project.location || "",
      locationLatitude: project.locationLatitude,
      locationLongitude: project.locationLongitude,
      locationRadiusMeters: project.locationRadiusMeters,
      shiftSchedule: project.shiftSchedule,
    };
  }

  async searchAddressSuggestions(query: string, limit = 8) {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      return [];
    }

    const normalizedLimit = Math.max(1, Math.min(limit, 10));
    const data = await this.fetchGeocoderJson("/search", {
      format: "jsonv2",
      addressdetails: "1",
      limit: String(normalizedLimit),
      q: normalizedQuery,
    });

    const matches = Array.isArray(data) ? data : [];
    const seenLabels = new Set<string>();

    return matches.reduce<
      Array<{ id: string; label: string; latitude: number; longitude: number }>
    >((suggestions, match, index) => {
      const candidate = match as {
        place_id?: string | number;
        display_name?: string;
        lat?: string | number;
        lon?: string | number;
        address?: {
          house_number?: string;
          road?: string;
          street?: string;
          pedestrian?: string;
          footway?: string;
          city?: string;
          town?: string;
          village?: string;
          municipality?: string;
          suburb?: string;
          postcode?: string;
          country?: string;
        };
      };
      const label = this.formatNominatimAddressLabel(candidate);
      const latitude = Number(candidate.lat);
      const longitude = Number(candidate.lon);

      if (
        !label ||
        Number.isNaN(latitude) ||
        Number.isNaN(longitude) ||
        seenLabels.has(label)
      ) {
        return suggestions;
      }

      seenLabels.add(label);
      suggestions.push({
        id: String(candidate.place_id || `${label}-${index}`),
        label,
        latitude,
        longitude,
      });

      return suggestions;
    }, []);
  }

  async reverseGeocodeCoordinate(latitude: number, longitude: number) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException(
        "Latitude and longitude must be valid numbers",
      );
    }

    const data = (await this.fetchGeocoderJson("/reverse", {
      format: "jsonv2",
      addressdetails: "1",
      lat: String(latitude),
      lon: String(longitude),
    })) as {
      display_name?: string;
      address?: {
        house_number?: string;
        road?: string;
        street?: string;
        pedestrian?: string;
        footway?: string;
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
        suburb?: string;
        postcode?: string;
        country?: string;
      };
    };

    return {
      label: this.formatNominatimAddressLabel(data) || data?.display_name || "",
    };
  }

  async findOne(id: string): Promise<Project> {
    const project = await this.projectModel.findById(id).exec();
    if (!project) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }
    return project;
  }

  async findOneWithPopulated(id: string): Promise<Project> {
    const project = await this.projectModel
      .findById(id)
      .populate("ownerId", "name email role avatarUrl")
      .populate("projectManagerId", "name email role avatarUrl")
      .populate("companyId", "name email")
      .populate(
        "clientId",
        "clientType companyName firstName lastName contactPerson email phone",
      )
      .populate("projectAdmins", "name email role avatarUrl")
      .populate(
        "workers",
        "name email role profession avatarUrl workStatus workStatusProjectId workStatusUpdatedAt",
      )
      .populate(
        "tasks",
        "taskTitle taskDescription startDate dueDate documents status completedAt completedByUserId assigneeUserId assigneeUserName",
      )
      .exec();
    if (!project) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }
    return project;
  }

  async addWorkers(projectId: string, workerIds: string[]): Promise<Project> {
    const project = await this.findOne(projectId);

    for (const workerId of workerIds) {
      const user = await this.usersService.findOne(workerId);
      if (String(user.companyId) !== String(project.companyId)) {
        throw new ForbiddenException(`User ${workerId} belongs to another company`);
      }
      if (user.role !== UserRole.Worker) {
        throw new ForbiddenException(`User ${workerId} is not a Worker`);
      }

      if (!project.workers.includes(workerId)) {
        await this.projectModel.findByIdAndUpdate(projectId, {
          $push: { workers: workerId },
        });
      }

      await this.usersService.addUserToProject(workerId, projectId);
    }

    return this.findOneWithPopulated(projectId);
  }

  async removeWorker(projectId: string, workerId: string): Promise<Project> {
    await this.projectModel.findByIdAndUpdate(projectId, {
      $pull: { workers: workerId },
    });

    await this.usersService.removeUserFromProject(workerId, projectId);

    return this.findOneWithPopulated(projectId);
  }

  async addProjectAdmin(projectId: string, userId: string): Promise<Project> {
    const project = await this.findOne(projectId);

    const user = await this.usersService.findOne(userId);
    if (String(user.companyId) !== String(project.companyId)) {
      throw new ForbiddenException(`User ${userId} belongs to another company`);
    }

    if (!project.projectAdmins.includes(userId)) {
      await this.projectModel.findByIdAndUpdate(projectId, {
        $push: { projectAdmins: userId },
      });
    }

    await this.usersService.addUserToProject(userId, projectId);

    return this.findOneWithPopulated(projectId);
  }

  async uploadDocuments(
    id: string,
    documents: Array<
      | string
      | {
          name: string;
          url: string;
          mimeType?: string;
          size?: number;
          uploadedAt?: Date;
          uploadedBy?: string;
          uploadedByName?: string;
        }
    >,
    actorUserId?: string,
  ): Promise<Project> {
    const existingProject = await this.findOne(id);
    let uploadedByName: string | undefined;

    if (actorUserId) {
      const actor = await this.usersService.findOne(actorUserId);
      uploadedByName = actor?.name || actor?.email;
    }

    const enrichedDocuments = (documents || []).map((document) =>
      typeof document === "string"
        ? document
        : {
            ...document,
            ...(actorUserId
              ? {
                  uploadedBy: actorUserId,
                  uploadedByName: document.uploadedByName || uploadedByName,
                }
              : {}),
          },
    );

    const updatedProject = await this.projectModel
      .findByIdAndUpdate(
        id,
        {
          documents: this.dedupeDocuments([
            ...(existingProject.documents || []),
            ...enrichedDocuments,
          ]),
        },
        { new: true },
      )
      .exec();

    if (!updatedProject) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }

    return this.findOneWithPopulated(id);
  }

  // Collapse a documents array so the same file (by url) never appears twice.
  // The edit-project form resends the existing documents on save, and uploads
  // append — without this, every save doubled the list.
  private dedupeDocuments<T>(documents: T[]): T[] {
    const seen = new Set<string>();
    const result: T[] = [];
    for (const doc of documents || []) {
      const key =
        typeof doc === "string"
          ? doc
          : (doc as { url?: string })?.url || JSON.stringify(doc);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(doc);
    }
    return result;
  }

  async update(
    id: string,
    updateProjectDto: Partial<CreateProjectDto>,
  ): Promise<Project> {
    const existingProject = await this.findOne(id);
    const nextDocuments =
      Array.isArray(updateProjectDto.documents) &&
      updateProjectDto.documents.length > 0
        ? this.dedupeDocuments([
            ...(existingProject.documents || []),
            ...updateProjectDto.documents,
          ])
        : existingProject.documents;

    // Validate the customer belongs to the project's company only
    // when the caller actually sends the field, so unrelated updates are left
    // untouched. An explicit null clears the reference.
    const clientPatch =
      "clientId" in updateProjectDto
        ? {
            clientId: await this.resolveClientId(
              updateProjectDto.clientId,
              String(existingProject.companyId),
            ),
          }
        : {};

    // Normalise any date the caller actually sends, so editing a project can
    // both set a real date and clear a bad one (empty/invalid/epoch → null).
    const datePatch: Record<string, Date | null> = {};
    if ("beginningDate" in updateProjectDto) {
      datePatch.beginningDate = this.cleanProjectDate(
        updateProjectDto.beginningDate,
      );
    }
    if ("endDate" in updateProjectDto) {
      datePatch.endDate = this.cleanProjectDate(updateProjectDto.endDate);
    }

    const updatedProject = await this.projectModel
      .findByIdAndUpdate(
        id,
        {
          ...updateProjectDto,
          ...clientPatch,
          ...datePatch,
          documents: nextDocuments,
        },
        { new: true },
      )
      .exec();
    if (!updatedProject) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }

    if (updateProjectDto.workers) {
      const previousWorkerIds = (existingProject.workers || []).map((worker) =>
        this.getEntityId(worker),
      );
      const nextWorkerIds = updateProjectDto.workers.map((worker) =>
        this.getEntityId(worker),
      );

      const addedWorkerIds = nextWorkerIds.filter(
        (workerId) => !previousWorkerIds.includes(workerId),
      );
      const removedWorkerIds = previousWorkerIds.filter(
        (workerId) => !nextWorkerIds.includes(workerId),
      );

      await Promise.all([
        ...addedWorkerIds.map((workerId) =>
          this.usersService.addUserToProject(workerId, id),
        ),
        ...removedWorkerIds.map((workerId) =>
          this.usersService.removeUserFromProject(workerId, id),
        ),
      ]);
    }

    // Keep project-admin membership in sync too (create() already does this on
    // add; update() previously only synced workers, so admins added/removed via
    // the edit form never had their projectIds updated).
    if (updateProjectDto.projectAdmins) {
      const previousAdminIds = (existingProject.projectAdmins || []).map(
        (admin) => this.getEntityId(admin),
      );
      const nextAdminIds = updateProjectDto.projectAdmins.map((admin) =>
        this.getEntityId(admin),
      );

      const addedAdminIds = nextAdminIds.filter(
        (adminId) => !previousAdminIds.includes(adminId),
      );
      const removedAdminIds = previousAdminIds.filter(
        (adminId) => !nextAdminIds.includes(adminId),
      );

      await Promise.all([
        ...addedAdminIds.map((adminId) =>
          this.usersService.addUserToProject(adminId, id),
        ),
        ...removedAdminIds.map((adminId) =>
          this.usersService.removeUserFromProject(adminId, id),
        ),
      ]);
    }

    return updatedProject;
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcileProjectStatuses(): Promise<void> {
    if (cronsDisabled() || this.isReconcilingStatuses) {
      return;
    }

    this.isReconcilingStatuses = true;

    try {
      const now = new Date();
      const dueProjects = await this.projectModel
        .find({ status: "planning", beginningDate: { $lte: now } })
        .exec();

      for (const project of dueProjects) {
        const nextStatus =
          project.endDate && project.endDate < now
            ? "completed"
            : "in_progress";

        await this.projectModel
          .findByIdAndUpdate(project._id, { status: nextStatus })
          .exec();
      }
    } catch (error) {
      this.logger.error("Failed to reconcile project statuses", error);
    } finally {
      this.isReconcilingStatuses = false;
    }
  }

  async remove(id: string): Promise<Project> {
    const deletedProject = await this.projectModel.findByIdAndDelete(id).exec();
    if (!deletedProject) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }
    return deletedProject;
  }

  async findAllPopulated(actor?: {
    role?: UserRole;
    companyId?: string | null;
  }) {
    // Tenant isolation: only superadmin may see every company's projects.
    // Everyone else is scoped to their own company (empty result if unattached).
    // Superadmin is scoped to its own company; only internal (no-actor) calls
    // are allowed to span every company.
    const filter = !actor
      ? {}
      : actor.companyId
        ? { companyId: actor.companyId }
        : { _id: null };

    return this.projectModel
      .find(filter)
      .populate({
        path: "ownerId",
        select: "name email role avatarUrl",
      })
      .populate({
        path: "projectManagerId",
        select: "name email role avatarUrl",
      })
      .populate({
        path: "companyId",
        select: "name email",
      })
      .populate({
        path: "clientId",
        select:
          "clientType companyName firstName lastName contactPerson email phone",
      })
      .populate({
        path: "projectAdmins",
        select: "name email role avatarUrl",
      })
      .populate({
        path: "workers",
        select:
          "name email role profession avatarUrl workStatus workStatusProjectId workStatusUpdatedAt",
      })
      .lean();
  }

  // One-shot populated fetch of every project the caller can see. Access
  // scoping mirrors GET /projects/my (SuperAdmin = all, CompanyAdmin = own
  // company, ProjectAdmin/Worker = own/assigned projects) and each project is
  // populated the same way as findOneWithPopulated (incl. tasks). Lets the
  // mobile app replace its per-project N+1 loop over /projects/:id/populated
  // with a single request.
  async findMyPopulated(user: ProjectAuthUser) {
    let filter: Record<string, unknown>;
    if (user?.role === UserRole.SuperAdmin) {
      filter = {};
    } else if (user?.role === UserRole.CompanyAdmin) {
      filter = user.companyId ? { companyId: user.companyId } : { _id: null };
    } else {
      // ProjectAdmin / Worker: only projects they own or are assigned to.
      const owner = user?.userId
        ? await this.usersService.findOne(user.userId)
        : null;
      const userProjectIds = Array.isArray(owner?.projectIds)
        ? owner.projectIds.filter(Boolean).map((projectId) => String(projectId))
        : [];
      filter = {
        $or: [
          { ownerId: user?.userId },
          { projectManagerId: user?.userId },
          { projectAdmins: user?.userId },
          { workers: user?.userId },
          ...(userProjectIds.length ? [{ _id: { $in: userProjectIds } }] : []),
        ],
      };
    }

    return this.projectModel
      .find(filter)
      .populate("ownerId", "name email role avatarUrl")
      .populate("projectManagerId", "name email role avatarUrl")
      .populate("companyId", "name email")
      .populate(
        "clientId",
        "clientType companyName firstName lastName contactPerson email phone",
      )
      .populate("projectAdmins", "name email role avatarUrl")
      .populate(
        "workers",
        "name email role profession avatarUrl workStatus workStatusProjectId workStatusUpdatedAt",
      )
      .populate(
        "tasks",
        "taskTitle taskDescription startDate dueDate documents status completedAt completedByUserId assigneeUserId assigneeUserName",
      )
      .lean();
  }
}
