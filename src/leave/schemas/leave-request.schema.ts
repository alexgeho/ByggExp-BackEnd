import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

// Frånvaro — an absence/leave request submitted by a worker and reviewed by an
// admin.
export enum LeaveType {
  Vacation = "vacation", // Semester
  Sick = "sick", // Sjukfrånvaro
  Vab = "vab", // VAB – vård av barn
  Parental = "parental", // Föräldraledig
  Leave = "leave", // Tjänstledig
  Other = "other",
}

export enum LeaveStatus {
  Pending = "pending", // inskickad
  Approved = "approved", // godkänd
  Rejected = "rejected", // avvisad
}

export type LeaveRequestDocument = HydratedDocument<LeaveRequest>;

@Schema({ timestamps: true })
export class LeaveRequest {
  @Prop({ type: String, ref: "Company", required: true, index: true })
  companyId: string;

  // The worker the absence is for (and, usually, the submitter).
  @Prop({ type: String, ref: "User", required: true, index: true })
  userId: string;

  @Prop({ enum: LeaveType, default: LeaveType.Vacation })
  type: LeaveType;

  @Prop({ default: "" })
  startDate: string;

  @Prop({ default: "" })
  endDate: string;

  // Half day off (e.g. afternoon) rather than a full day.
  @Prop({ type: Boolean, default: false })
  halfDay: boolean;

  @Prop({ default: "" })
  reason: string;

  @Prop({ enum: LeaveStatus, default: LeaveStatus.Pending, index: true })
  status: LeaveStatus;

  @Prop({ default: "" })
  adminNote: string;

  @Prop({ type: String, ref: "User", default: null })
  reviewedByUserId?: string | null;

  @Prop({ type: Date, default: null })
  reviewedAt?: Date | null;
}

export const LeaveRequestSchema = SchemaFactory.createForClass(LeaveRequest);

LeaveRequestSchema.index({ companyId: 1, startDate: -1 });
