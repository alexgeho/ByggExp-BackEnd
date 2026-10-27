import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

// Lönehistorik: a worker's hourly wage from a date on. The rate in force on a
// day is the latest entry with validFrom ≤ that day; User.hourlyRate mirrors
// today's rate for older screens. Kept so a period is always paid at the wage
// that applied then, and so an agreement raise can be dated to 1 May.
export type WageRateDocument = HydratedDocument<WageRate>;

export const WAGE_RATE_REASONS = [
  "initial", // the rate the worker had before history was kept
  "manual", // changed by an admin
  "agreement_raise", // Byggavtalet general raise
] as const;
export type WageRateReason = (typeof WAGE_RATE_REASONS)[number];

@Schema({ timestamps: true })
export class WageRate {
  @Prop({ type: String, ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ type: String, ref: "User", required: true, index: true })
  userId: string;

  @Prop({ type: Number, required: true })
  hourlyRate: number;

  // YYYY-MM-DD, inclusive.
  @Prop({ required: true })
  validFrom: string;

  @Prop({ type: String, enum: WAGE_RATE_REASONS, default: "manual" })
  reason: WageRateReason;

  // The agreement version whose raise produced this rate.
  @Prop({ type: String, ref: "AgreementRuleSet", default: null })
  ruleSetId?: string | null;

  @Prop({ type: String, ref: "User", default: null })
  createdByUserId?: string | null;
}

export const WageRateSchema = SchemaFactory.createForClass(WageRate);

// One rate per worker and day; a later change on the same day replaces it.
WageRateSchema.index({ userId: 1, validFrom: 1 }, { unique: true });
