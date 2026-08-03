import { Controller, Post, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { ManagerRemindersService } from "./manager-reminders.service";

@Controller("manager-reminders")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class ManagerRemindersController {
  constructor(private readonly service: ManagerRemindersService) {}

  // Send the "needs attention" summary to the caller right now (preview/test).
  @Post("test")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  sendTest(@Request() req): Promise<{ sent: boolean }> {
    return this.service.sendTest(req.user.userId);
  }
}
