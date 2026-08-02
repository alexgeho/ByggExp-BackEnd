import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { GdprController } from "./gdpr.controller";
import { GdprService } from "./gdpr.service";
import { User, UserSchema } from "../users/schemas/user.schema";
import { Shift, ShiftSchema } from "../shifts/schemas/shift.schema";
import { Task, TaskSchema } from "../tasks/schemas/task.schema";
import {
  Assignment,
  AssignmentSchema,
} from "../assignments/schemas/assignment.schema";
import { Expense, ExpenseSchema } from "../expenses/schemas/expense.schema";
import {
  LeaveRequest,
  LeaveRequestSchema,
} from "../leave/schemas/leave-request.schema";
import {
  DeviceToken,
  DeviceTokenSchema,
} from "../notifications/schemas/device-token.schema";
import {
  WorkerNote,
  WorkerNoteSchema,
} from "../users/schemas/worker-note.schema";
import {
  UserActivityLog,
  UserActivityLogSchema,
} from "../users/schemas/user-activity-log.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Shift.name, schema: ShiftSchema },
      { name: Task.name, schema: TaskSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Expense.name, schema: ExpenseSchema },
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
      { name: DeviceToken.name, schema: DeviceTokenSchema },
      { name: WorkerNote.name, schema: WorkerNoteSchema },
      { name: UserActivityLog.name, schema: UserActivityLogSchema },
    ]),
  ],
  controllers: [GdprController],
  providers: [GdprService],
})
export class GdprModule {}
