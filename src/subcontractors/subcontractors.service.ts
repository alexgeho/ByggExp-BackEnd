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
import { CompanyService } from "../company/company.service";
import { languageCode } from "../common/language";
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
    private readonly companyService: CompanyService,
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

  // Creates the firm and invites its contact person. The invitation is the same
  // one a client's own admin gets (owner 18.11): a link to the /invite page,
  // name + password there, then the account-ready mail; no user exists until
  // the person accepts. The seat limit is checked now, so the invite cannot
  // lead to an account the plan has no room for.
  async create(dto: CreateSubcontractorDto, actor: AuthUser) {
    const companyId = this.requireCompany(actor);
    const email = (dto.email || "").trim().toLowerCase();

    if (email) {
      // Acceptance refuses an address that already has an account anywhere.
      const existing = await this.usersService.findByEmail(email);
      if (existing) {
        throw new ConflictException(
          "En användare med den e-postadressen finns redan",
        );
      }
      await this.usersService.assertCompanySeatAvailable(companyId);
    }

    const firm = await new this.subcontractorModel({
      companyId,
      name: dto.name?.trim() || dto.contactPerson?.trim() || email,
      orgNumber: dto.orgNumber?.trim() || "",
      contactPerson: dto.contactPerson?.trim() || "",
      email,
      phone: dto.phone?.trim() || "",
      workType: dto.workType?.trim() || "",
      createdByUserId: actor.userId ?? null,
    }).save();

    if (!email) return { ...firm.toObject(), inviteEmailSent: false };

    try {
      // The invitation goes out in the inviting admin's language.
      const inviter = actor.userId
        ? await this.userModel
            .findById(actor.userId)
            .select("language")
            .lean()
            .exec()
        : null;
      const { invited } = await this.companyService.inviteSubcontractorContact({
        companyId,
        subcontractorId: String(firm._id),
        subcontractorName: firm.name,
        email,
        name: dto.contactPerson?.trim() || "",
        language: languageCode(inviter?.language),
        invitedByUserId: actor.userId ?? null,
      });
      return { ...firm.toObject(), inviteEmailSent: invited };
    } catch (error) {
      // No firm without its invitation: the admin simply tries again.
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
    await this.companyService.removeSubcontractorInvites(String(firm._id));
    await firm.deleteOne();
    return { ok: true };
  }
}
