import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  Subcontractor,
  SubcontractorDocument,
} from "./schemas/subcontractor.schema";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import { Company, CompanyDocument } from "../company/schemas/company.schema";
import { UsersService } from "../users/users.service";
import {
  CreateSubcontractorDto,
  UpdateSubcontractorDto,
} from "./dto/subcontractor.dto";

type AuthUser = {
  role?: UserRole;
  companyId?: string | null;
  subcontractorId?: string | null;
  userId?: string;
};

@Injectable()
export class SubcontractorsService {
  constructor(
    @InjectModel(Subcontractor.name)
    private subcontractorModel: Model<SubcontractorDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    private readonly usersService: UsersService,
  ) {}

  private requireCompany(actor?: AuthUser): string {
    if (!actor?.companyId) {
      throw new ForbiddenException("No company context for this request");
    }
    return String(actor.companyId);
  }

  private async findInCompany(
    id: string,
    companyId: string,
  ): Promise<SubcontractorDocument> {
    const firm = await this.subcontractorModel.findById(id).exec();
    if (!firm) throw new NotFoundException(`Subcontractor "${id}" not found`);
    if (String(firm.companyId) !== companyId) {
      throw new ForbiddenException("Subcontractor belongs to another company");
    }
    return firm;
  }

  // The company's firms, by name. A subcontractor's contact person gets only
  // its own firm, with the name of the company it works for (shown in the
  // admin header: "uppdrag åt …").
  async findAll(actor: AuthUser) {
    const companyId = this.requireCompany(actor);
    if (actor.role === UserRole.Subcontractor) {
      if (!actor.subcontractorId) return [];
      const [firm, company] = await Promise.all([
        this.subcontractorModel
          .findOne({ _id: actor.subcontractorId, companyId })
          .lean()
          .exec(),
        this.companyModel.findById(companyId).select("name").lean().exec(),
      ]);
      return firm ? [{ ...firm, clientCompanyName: company?.name || "" }] : [];
    }
    return this.subcontractorModel
      .find({ companyId })
      .sort({ name: 1 })
      .lean()
      .exec();
  }

  // Creates the firm and, when an e-mail is given, invites its contact person
  // to the admin (role "subcontractor"). The invite uses the ordinary user
  // invitation, so the seat limit and the per-company e-mail check apply.
  async create(dto: CreateSubcontractorDto, actor: AuthUser) {
    const companyId = this.requireCompany(actor);
    const email = (dto.email || "").trim().toLowerCase();

    if (email) {
      const existing = await this.usersService.findByEmailInCompany(
        email,
        companyId,
      );
      if (existing) {
        throw new ConflictException(
          "En användare med den e-postadressen finns redan",
        );
      }
    }

    const firm = await new this.subcontractorModel({
      companyId,
      name: dto.name.trim(),
      orgNumber: dto.orgNumber?.trim() || "",
      contactPerson: dto.contactPerson?.trim() || "",
      email,
      phone: dto.phone?.trim() || "",
      workType: dto.workType?.trim() || "",
      createdByUserId: actor.userId ?? null,
    }).save();

    if (!email) return { ...firm.toObject(), inviteEmailSent: false };

    try {
      const { user, inviteEmailSent } =
        await this.usersService.createUserPendingApproval({
          email,
          name: dto.contactPerson?.trim() || dto.name.trim(),
          profession: dto.workType?.trim() || "",
          role: UserRole.Subcontractor,
          companyId,
          subcontractorId: String(firm._id),
          createdBy: actor.userId ?? null,
        });
      firm.contactUserId = String(user._id);
      await firm.save();
      return { ...firm.toObject(), inviteEmailSent };
    } catch (error) {
      // No firm without its contact when the invitation could not be created
      // (seat limit, duplicate e-mail): the admin simply tries again.
      await firm.deleteOne();
      throw error;
    }
  }

  async update(id: string, dto: UpdateSubcontractorDto, actor: AuthUser) {
    const companyId = this.requireCompany(actor);
    const firm = await this.findInCompany(id, companyId);
    if (dto.name !== undefined) firm.name = dto.name.trim();
    if (dto.orgNumber !== undefined) firm.orgNumber = dto.orgNumber.trim();
    if (dto.contactPerson !== undefined) {
      firm.contactPerson = dto.contactPerson.trim();
    }
    if (dto.phone !== undefined) firm.phone = dto.phone.trim();
    if (dto.workType !== undefined) firm.workType = dto.workType.trim();
    await firm.save();
    return firm;
  }

  // A firm that still has people cannot be removed: their hours stay tied to
  // it, so the admin moves or removes the people first.
  async remove(id: string, actor: AuthUser): Promise<{ ok: true }> {
    const companyId = this.requireCompany(actor);
    const firm = await this.findInCompany(id, companyId);
    const people = await this.userModel
      .countDocuments({ companyId, subcontractorId: String(firm._id) })
      .exec();
    if (people > 0) {
      throw new ConflictException(
        "Underentreprenören har personal — flytta eller ta bort personerna först",
      );
    }
    await firm.deleteOne();
    return { ok: true };
  }
}
