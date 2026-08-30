import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type TeamDocument = Team & Document;

// A reusable work-team (arbetslag): a named group of workers that can be planned
// onto a project as a unit on the staffing board. Company-scoped.
@Schema({ timestamps: true })
export class Team {
  @Prop({ required: true, ref: "Company", index: true })
  companyId: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: [String], ref: "User", default: [] })
  memberIds: string[];

  @Prop({ type: String, ref: "User", default: null })
  createdByUserId?: string | null;
}

export const TeamSchema = SchemaFactory.createForClass(Team);
TeamSchema.index({ companyId: 1, name: 1 });
