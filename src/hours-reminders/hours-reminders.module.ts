import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { NotificationsModule } from "../notifications/notifications.module";
import { Project, ProjectSchema } from "../projects/schemas/project.schema";
import { Shift, ShiftSchema } from "../shifts/schemas/shift.schema";
import { User, UserSchema } from "../users/schemas/user.schema";
import { Company, CompanySchema } from "../company/schemas/company.schema";
import { HoursRemindersController } from "./hours-reminders.controller";
import { HoursRemindersService } from "./hours-reminders.service";

@Module({
  imports: [
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: Shift.name, schema: ShiftSchema },
      { name: User.name, schema: UserSchema },
      { name: Company.name, schema: CompanySchema },
    ]),
  ],
  controllers: [HoursRemindersController],
  providers: [HoursRemindersService],
  exports: [HoursRemindersService],
})
export class HoursRemindersModule {}
