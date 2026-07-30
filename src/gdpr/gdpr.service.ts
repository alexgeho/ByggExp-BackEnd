import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import { Shift, ShiftDocument } from "../shifts/schemas/shift.schema";
import { Task, TaskDocument } from "../tasks/schemas/task.schema";
import {
  Assignment,
  AssignmentDocument,
} from "../assignments/schemas/assignment.schema";
import { Expense, ExpenseDocument } from "../expenses/schemas/expense.schema";
import {
  LeaveRequest,
  LeaveRequestDocument,
} from "../leave/schemas/leave-request.schema";
import {
  DeviceToken,
  DeviceTokenDocument,
} from "../notifications/schemas/device-token.schema";

type AuthUser = {
  role?: UserRole;
  companyId?: string | null;
  userId?: string;
};

const SECRET_FIELDS = [
  "password",
  "emailVerificationToken",
  "magicLoginCode",
];

@Injectable()
export class GdprService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Shift.name) private shiftModel: Model<ShiftDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(Assignment.name)
    private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Expense.name) private expenseModel: Model<ExpenseDocument>,
    @InjectModel(LeaveRequest.name)
    private leaveModel: Model<LeaveRequestDocument>,
    @InjectModel(DeviceToken.name)
    private deviceTokenModel: Model<DeviceTokenDocument>,
  ) {}

  private async loadUserInCompany(
    userId: string,
    actor?: AuthUser,
  ): Promise<UserDocument> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException(`User "${userId}" not found`);
    }
    if (
      actor?.companyId &&
      String(user.companyId ?? "") !== String(actor.companyId)
    ) {
      throw new ForbiddenException("User belongs to another company");
    }
    return user;
  }

  // Right of access / portability: a machine-readable bundle of the user's
  // personal data across the platform (secrets stripped).
  async export(userId: string, actor?: AuthUser) {
    const user = await this.loadUserInCompany(userId, actor);
    const [shifts, tasks, assignments, expenses, leave, deviceTokens] =
      await Promise.all([
        this.shiftModel.find({ workerId: userId }).lean().exec(),
        this.taskModel.find({ assigneeUserId: userId }).lean().exec(),
        this.assignmentModel.find({ userId }).lean().exec(),
        this.expenseModel.find({ userId }).lean().exec(),
        this.leaveModel.find({ userId }).lean().exec(),
        this.deviceTokenModel.find({ userId }).lean().exec(),
      ]);

    const profile = user.toObject() as Record<string, unknown>;
    SECRET_FIELDS.forEach((field) => delete profile[field]);

    return {
      exportedAt: new Date().toISOString(),
      userId,
      profile,
      shifts,
      tasks,
      assignments,
      expenses,
      leave,
      // Register presence of push devices without exposing the raw tokens.
      deviceTokens: deviceTokens.map((token) => ({
        platform: (token as Record<string, unknown>).platform,
        createdAt: (token as Record<string, unknown>).createdAt,
      })),
    };
  }

  // Right to erasure: de-identify the user and remove/scrub linked personal
  // data. The record is kept (anonymised) so retained data (e.g. bookkeeping)
  // stays referentially valid.
  async erase(userId: string, actor?: AuthUser) {
    const user = await this.loadUserInCompany(userId, actor);
    const erasedAt = new Date();

    Object.assign(user, {
      name: "Raderad användare",
      email: `raderad+${String(user._id)}@exempel.invalid`,
      phoneAreaCode: null,
      phoneNumber: null,
      personalNumber: null,
      avatarUrl: "",
      profession: "",
      emailVerificationToken: null,
      magicLoginCode: null,
      erasedAt,
    });
    await user.save();

    await Promise.all([
      this.deviceTokenModel.deleteMany({ userId }),
      this.shiftModel.updateMany(
        { workerId: userId },
        { $set: { locationSnapshot: "" } },
      ),
      this.taskModel.updateMany(
        { assigneeUserId: userId },
        { $set: { assigneeUserName: "Raderad användare" } },
      ),
    ]);

    return { ok: true, erasedAt };
  }
}
