import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { User, UserSchema } from "../users/schemas/user.schema";
import { LeaveController } from "./leave.controller";
import { LeaveService } from "./leave.service";
import {
  LeaveRequest,
  LeaveRequestSchema,
} from "./schemas/leave-request.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [LeaveController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
