import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Project, ProjectDocument } from './schemas/project.schema';
import { CreateProjectDto } from './dto/create-project.dto';
import { UsersService } from '../users/users.service';
import { CompanyService } from '../company/company.service';
import { User, UserRole } from '../users/schemas/user.schema';

@Injectable()
export class ProjectsService {
  private readonly geocoderHeaders = {
    Accept: 'application/json',
    'Accept-Language': 'en',
    'User-Agent':
      process.env.GEOCODER_USER_AGENT ||
      'ByggExp/1.0 (server geocoding proxy)',
  };

  constructor(
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    private usersService: UsersService,
    private companyService: CompanyService,
  ) {}

  private getEntityId(value: unknown): string {
    if (!value) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    const entity = value as { _id?: unknown; id?: unknown };
    return String(entity._id ?? entity.id ?? '');
  }

  private pickUserIdByRole(users: User[], roles: UserRole[]): string {
    for (const role of roles) {
      const match = users.find((user) => user.role === role);
      const matchId = this.getEntityId(match);
      if (matchId) {
        return matchId;
      }
    }

    return '';
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
      return match.display_name?.trim() || '';
    }

    const houseNumber = address.house_number?.trim();
    const road = (
      address.road ||
      address.street ||
      address.pedestrian ||
      address.footway
    )?.trim();

    let streetLine = '';
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

    const parts = [streetLine, locality, address.postcode, address.country].filter(
      Boolean,
    );

    if (parts.length) {
      return parts.join(', ');
    }

    return match.display_name?.trim() || '';
  }

  private async resolveCreatePayload(
    createProjectDto: CreateProjectDto,
    currentUser?: { userId?: string; role?: UserRole; companyId?: string | null },
  ): Promise<CreateProjectDto> {
    let companyId =
      createProjectDto.companyId ||
      createProjectDto.clientCompanyId ||
      currentUser?.companyId ||
      '';

    if (!companyId) {
      const companies = await this.companyService.findAll();
      companyId = this.getEntityId(companies[0]);
    }

    if (!companyId) {
      throw new BadRequestException('No company available for project creation');
    }

    const company = await this.companyService.findOne(companyId);
    let candidateUsers = await this.usersService.findAllByCompany(companyId);

    if (!candidateUsers.length) {
      candidateUsers = await this.usersService.findAll();
    }

    const currentUserId = currentUser?.userId || '';
    const currentCompanyUserId = candidateUsers.find(
      (user) => this.getEntityId(user) === currentUserId,
    )
      ? currentUserId
      : '';

    const primaryCompanyAdminId =
      (Array.isArray(company.companyAdmins)
        ? company.companyAdmins.find(Boolean)
        : '') ||
      this.pickUserIdByRole(candidateUsers, [UserRole.CompanyAdmin]);

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
        'No suitable users available to assign project ownership',
      );
    }

    return {
      ...createProjectDto,
      companyId,
      ownerId,
      projectManagerId,
    };
  }

  async create(
    createProjectDto: CreateProjectDto,
    currentUser?: { userId?: string; role?: UserRole; companyId?: string | null },
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
        await this.usersService.addUserToProject(adminId, project._id.toString());
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
    return this.projectModel.find({
      $or: [
        { ownerId: userId },
        { projectManagerId: userId },
        { projectAdmins: userId },
        { workers: userId },
      ],
    }).exec();
  }

  async findByIds(ids: string[]): Promise<Project[]> {
    return this.projectModel.find({ _id: { $in: ids } })
      .select(
        'companyId ownerId projectManagerId name status location locationLatitude locationLongitude locationRadiusMeters shiftSchedule',
      )
      .exec();
  }

  async findProjectById(
    id: string,
  ): Promise<{
    id: string;
    name: string;
    status: string;
    companyId: string;
    location: string;
    locationLatitude?: number;
    locationLongitude?: number;
    locationRadiusMeters?: number;
    shiftSchedule?: Project['shiftSchedule'];
  } | null> {
    const project = await this.projectModel
      .findById(id)
      .select(
        'name status companyId location locationLatitude locationLongitude locationRadiusMeters shiftSchedule',
      )
      .exec();
    if (!project) return null;
    return {
      id: project._id.toString(),
      name: project.name,
      status: project.status,
      companyId: project.companyId,
      location: project.location || '',
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
    const data = await this.fetchGeocoderJson('/search', {
      format: 'jsonv2',
      addressdetails: '1',
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
      throw new BadRequestException('Latitude and longitude must be valid numbers');
    }

    const data = (await this.fetchGeocoderJson('/reverse', {
      format: 'jsonv2',
      addressdetails: '1',
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
      label: this.formatNominatimAddressLabel(data) || data?.display_name || '',
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
      .populate('ownerId', 'name email role avatarUrl')
      .populate('projectManagerId', 'name email role avatarUrl')
      .populate('companyId', 'name email')
      .populate('projectAdmins', 'name email role avatarUrl')
      .populate('workers', 'name email role profession avatarUrl')
      .populate('tasks', 'taskTitle taskDescription startDate dueDate documents')
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
    documents: Array<string | { name: string; url: string; mimeType?: string; size?: number; uploadedAt?: Date; uploadedBy?: string; uploadedByName?: string }>,
    actorUserId?: string,
  ): Promise<Project> {
    const existingProject = await this.findOne(id);
    let uploadedByName: string | undefined;

    if (actorUserId) {
      const actor = await this.usersService.findOne(actorUserId);
      uploadedByName = actor?.name || actor?.email;
    }

    const enrichedDocuments = (documents || []).map((document) => (
      typeof document === 'string'
        ? document
        : {
          ...document,
          ...(actorUserId
            ? {
              uploadedBy: actorUserId,
              uploadedByName: document.uploadedByName || uploadedByName,
            }
            : {}),
        }
    ));

    const updatedProject = await this.projectModel
      .findByIdAndUpdate(
        id,
        {
          documents: [...(existingProject.documents || []), ...enrichedDocuments],
        },
        { new: true },
      )
      .exec();

    if (!updatedProject) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }

    return this.findOneWithPopulated(id);
  }

  async update(id: string, updateProjectDto: Partial<CreateProjectDto>): Promise<Project> {
    const existingProject = await this.findOne(id);
    const nextDocuments =
      Array.isArray(updateProjectDto.documents) && updateProjectDto.documents.length > 0
        ? [...(existingProject.documents || []), ...updateProjectDto.documents]
        : existingProject.documents;

    const updatedProject = await this.projectModel
      .findByIdAndUpdate(
        id,
        {
          ...updateProjectDto,
          documents: nextDocuments,
        },
        { new: true },
      )
      .exec();
    if (!updatedProject) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }
    return updatedProject;
  }

  async remove(id: string): Promise<Project> {
    const deletedProject = await this.projectModel.findByIdAndDelete(id).exec();
    if (!deletedProject) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }
    return deletedProject;
  }

  async findAllPopulated() {
    return this.projectModel
      .find()
      .populate({
        path: 'ownerId',
        select: 'name email role avatarUrl',
      })
      .populate({
        path: 'projectManagerId',
        select: 'name email role avatarUrl',
      })
      .populate({
        path: 'companyId',
        select: 'name email',
      })
      .populate({
        path: 'projectAdmins',
        select: 'name email role avatarUrl',
      })
      .populate({
        path: 'workers',
        select: 'name email role profession avatarUrl',
      })
      .lean();
  }
}