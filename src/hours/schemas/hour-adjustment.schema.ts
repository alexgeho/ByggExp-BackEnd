import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type HourAdjustmentDocument = HourAdjustment & Document;

// Admin correction of a worker's planned hours for a single day on a project.
// Keeps the original (schedule-derived) value so the edit trail survives.
@Schema({ timestamps: true })
export class HourAdjustment {
  @Prop({ ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ ref: "Project", required: true, index: true })
  projectId: string;

  @Prop({ ref: "User", required: true, index: true })
  workerId: string;

  // Day key in YYYY-MM-DD, matching Shift.shiftDate.
  @Prop({ required: true })
  date: string;

  // Corrected planned hours the admin wants to bill/pay on.
  @Prop({ type: Number, required: true })
  plannedHours: number;

  // Schedule-derived planned hours before any correction (for the was→now trail).
  @Prop({ type: Number, required: true })
  originalPlannedHours: number;

  @Prop({ ref: "User" })
  updatedByUserId?: string;

  @Prop({ default: "" })
  note?: string;
}

export const HourAdjustmentSchema =
  SchemaFactory.createForClass(HourAdjustment);

// One adjustment per worker-day-project within a company.
HourAdjustmentSchema.index(
  { companyId: 1, projectId: 1, workerId: 1, date: 1 },
  { unique: true },
);
