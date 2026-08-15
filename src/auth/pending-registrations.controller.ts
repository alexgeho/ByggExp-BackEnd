import { Controller, Get, Delete, Param, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import {
  PendingRegistration,
  PendingRegistrationDocument,
} from "./schemas/pending-registration.schema";

// Superadmin-only view of self-serve sign-up requests that haven't confirmed
// their email yet (they auto-expire after 24h, but this lets the superadmin see
// and purge them). Confirmed sign-ups become Companies (see the Companies list).
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(UserRole.SuperAdmin)
@Controller("admin/pending-registrations")
export class PendingRegistrationsController {
  constructor(
    @InjectModel(PendingRegistration.name)
    private readonly pendingModel: Model<PendingRegistrationDocument>,
  ) {}

  @Get()
  async list() {
    return this.pendingModel
      .find(
        {},
        { email: 1, companyName: 1, userName: 1, expiresAt: 1, createdAt: 1 },
      )
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.pendingModel.findByIdAndDelete(id).exec();
    return { success: true };
  }
}
