import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Shift, ShiftSchema } from "../shifts/schemas/shift.schema";
import { Project, ProjectSchema } from "../projects/schemas/project.schema";
import { User, UserSchema } from "../users/schemas/user.schema";
import {
  HourAdjustment,
  HourAdjustmentSchema,
} from "./schemas/hour-adjustment.schema";
import {
  LeaveRequest,
  LeaveRequestSchema,
} from "../leave/schemas/leave-request.schema";
import { HoursController } from "./hours.controller";
import { HoursService } from "./hours.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Shift.name, schema: ShiftSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: User.name, schema: UserSchema },
      { name: HourAdjustment.name, schema: HourAdjustmentSchema },
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
    ]),
  ],
  controllers: [HoursController],
  providers: [HoursService],
  exports: [HoursService],
})
export class HoursModule {}
