import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import {
  CreateLeaveDto,
  ReviewLeaveDto,
  UpdateLeaveDto,
} from "./dto/leave.dto";
import {
  LeaveRequest,
  LeaveRequestDocument,
  LeaveStatus,
} from "./schemas/leave-request.schema";

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
  _id?: string;
};

const ADMIN_ROLES = [
  UserRole.SuperAdmin,
  UserRole.CompanyAdmin,
  UserRole.ProjectAdmin,
];

@Injectable()
export class LeaveService {
  constructor(
    @InjectModel(LeaveRequest.name)
    private model: Model<LeaveRequestDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  private isAdmin(user: AuthUser) {
    return ADMIN_ROLES.includes(user.role);
  }
  private uid(user: AuthUser) {
    return String(user.userId || user._id || "");
  }
  private companyId(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return user.companyId;
  }

  async create(dto: CreateLeaveDto, user: AuthUser) {
    const companyId = this.companyId(user);
    // Only admins may file for someone else.
    const userId =
      dto.userId && this.isAdmin(user) ? dto.userId : this.uid(user);
    const doc = new this.model({
      ...dto,
      companyId,
      userId,
      status: LeaveStatus.Pending,
    });
    return doc.save();
  }

  async findAll(
    user: AuthUser,
    filters: { status?: string; userId?: string } = {},
  ) {
    if (!user.companyId) return [];
    const filter: Record<string, unknown> = { companyId: user.companyId };
    if (filters.status) filter.status = filters.status;
    // Workers only ever see their own requests.
    if (!this.isAdmin(user)) filter.userId = this.uid(user);
    else if (filters.userId) filter.userId = filters.userId;

    const requests = await this.model
      .find(filter)
      .sort({ startDate: -1, createdAt: -1 })
      .lean()
      .exec();
    return this.withNames(requests);
  }

  async findOne(id: string, user: AuthUser) {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException("Leave request not found");
    this.assertAccess(doc, user);
    return doc;
  }

  async update(id: string, dto: UpdateLeaveDto, user: AuthUser) {
    const doc = await this.findOne(id, user);
    // Workers can only edit their own still-pending request.
    if (!this.isAdmin(user)) {
      if (String(doc.userId) !== this.uid(user)) {
        throw new ForbiddenException("You can only edit your own requests");
      }
      if (doc.status !== LeaveStatus.Pending) {
        throw new ForbiddenException(
          "This request has been reviewed and can no longer be changed",
        );
      }
    }
    Object.assign(doc, dto, { companyId: doc.companyId, userId: doc.userId });
    await doc.save();
    return doc;
  }

  async review(id: string, dto: ReviewLeaveDto, user: AuthUser) {
    const doc = await this.findOne(id, user);
    doc.status = dto.status;
    if (dto.adminNote !== undefined) doc.adminNote = dto.adminNote;
    if (dto.status === LeaveStatus.Pending) {
      doc.reviewedByUserId = null;
      doc.reviewedAt = null;
    } else {
      doc.reviewedByUserId = this.uid(user);
      doc.reviewedAt = new Date();
    }
    await doc.save();
    return doc;
  }

  async remove(id: string, user: AuthUser) {
    const doc = await this.findOne(id, user);
    if (!this.isAdmin(user) && String(doc.userId) !== this.uid(user)) {
      throw new ForbiddenException("You can only delete your own requests");
    }
    await this.model.findByIdAndDelete(id).exec();
    return doc;
  }

  private async withNames(requests: any[]) {
    const ids = [...new Set(requests.map((r) => String(r.userId)))];
    const users = ids.length
      ? await this.userModel
          .find({ _id: { $in: ids } })
          .select("_id name email")
          .lean()
          .exec()
      : [];
    const byId = new Map(users.map((u: any) => [String(u._id), u]));
    return requests.map((r) => ({
      ...r,
      userName:
        byId.get(String(r.userId))?.name ||
        byId.get(String(r.userId))?.email ||
        "",
    }));
  }

  private assertAccess(doc: LeaveRequestDocument, user: AuthUser) {
    if (!user.companyId || String(doc.companyId) !== String(user.companyId)) {
      throw new ForbiddenException("You do not have access to this request");
    }
    if (!this.isAdmin(user) && String(doc.userId) !== this.uid(user)) {
      throw new ForbiddenException("You do not have access to this request");
    }
  }
}
