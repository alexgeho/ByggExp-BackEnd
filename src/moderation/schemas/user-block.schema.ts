import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type UserBlockDocument = UserBlock & Document;

// One row per (blocker -> blocked) pair. Kept in its own collection so blocking
// doesn't touch the heavily-indexed User schema. companyId is stored so the
// tenant cascade (CompanyService.remove) sweeps these rows with everything else.
@Schema({ timestamps: true })
export class UserBlock {
  @Prop({ required: true, ref: "User", index: true })
  blockerId: string;

  @Prop({ required: true, ref: "User", index: true })
  blockedId: string;

  @Prop({ type: String, ref: "Company", default: null })
  companyId: string | null;
}

export const UserBlockSchema = SchemaFactory.createForClass(UserBlock);

// A user can only block another user once.
UserBlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
