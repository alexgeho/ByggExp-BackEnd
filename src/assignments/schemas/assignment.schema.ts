import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type AssignmentDocument = Assignment & Document;

// One staffing assignment: a user is planned on a project for a given day.
// Multiple assignments per user/day are allowed (the board surfaces those as
// "overbooked"). Scoped to a company for tenant isolation.
@Schema({ timestamps: true })
export class Assignment {
  @Prop({ required: true, ref: "Company", index: true })
  companyId: string;

  @Prop({ type: String, ref: "User", required: true, index: true })
  userId: string;

  // Optional: a person can be booked for a day before the project is known.
  @Prop({ type: String, ref: "Project", default: null, index: true })
  projectId: string | null;

  @Prop({ type: Date, required: true, index: true })
  date: Date;

  @Prop({ type: Number, default: 8 })
  hours: number;

  @Prop({ default: "" })
  note: string;

  @Prop({ type: String, ref: "User", default: null })
  createdByUserId?: string | null;
}

export const AssignmentSchema = SchemaFactory.createForClass(Assignment);
AssignmentSchema.index({ companyId: 1, date: 1 });
