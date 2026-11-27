import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { NotificationsModule } from "../notifications/notifications.module";
import { Project, ProjectSchema } from "../projects/schemas/project.schema";
import { UsersModule } from "../users/users.module";
import { User, UserSchema } from "../users/schemas/user.schema";
import { Ata, AtaSchema } from "../ata/schemas/ata.schema";
import { Company, CompanySchema } from "../company/schemas/company.schema";
import {
  HourAdjustment,
  HourAdjustmentSchema,
} from "../hours/schemas/hour-adjustment.schema";
import { Shift, ShiftSchema } from "./schemas/shift.schema";
import { ShiftEvent, ShiftEventSchema } from "./schemas/shift-event.schema";
import { ShiftsController } from "./shifts.controller";
import { ShiftsService } from "./shifts.service";
import { KorjournalService } from "./korjournal.service";
import { Expense, ExpenseSchema } from "../expenses/schemas/expense.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Shift.name, schema: ShiftSchema },
      { name: ShiftEvent.name, schema: ShiftEventSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: User.name, schema: UserSchema },
      { name: Company.name, schema: CompanySchema },
      { name: Ata.name, schema: AtaSchema },
      { name: HourAdjustment.name, schema: HourAdjustmentSchema },
      { name: Expense.name, schema: ExpenseSchema },
    ]),
    NotificationsModule,
    UsersModule,
  ],
  controllers: [ShiftsController],
  providers: [ShiftsService, KorjournalService],
  exports: [ShiftsService],
})
export class ShiftsModule {}
