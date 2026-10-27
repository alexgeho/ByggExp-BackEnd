import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

// Per-company payroll settings for the lönerunderlag export: which payroll
// system the company runs, the file format it imports, and which löneart /
// frånvarokod each ByggExp item maps to there. Löneart numbers differ between
// systems and accounts, so they are never hard-coded — an item with no code
// mapped is left out of the export and flagged in the preview.
export type PayrollSettingsDocument = HydratedDocument<PayrollSettings>;

// Systems we name in the UI. PAXml is the common Swedish import format; CSV is
// the fallback for a system that only takes a spreadsheet.
export const PAYROLL_SYSTEMS = [
  "fortnox",
  "visma",
  "hogia",
  "crona",
  "other",
] as const;
export type PayrollSystem = (typeof PAYROLL_SYSTEMS)[number];

export const EXPORT_FORMATS = ["paxml", "csv"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

@Schema({ timestamps: true })
export class PayrollSettings {
  @Prop({ type: String, ref: "Company", required: true, unique: true })
  companyId: string;

  @Prop({ default: "byggavtalet" })
  agreement: string;

  @Prop({ type: String, enum: PAYROLL_SYSTEMS, default: "fortnox" })
  payrollSystem: PayrollSystem;

  @Prop({ type: String, enum: EXPORT_FORMATS, default: "paxml" })
  exportFormat: ExportFormat;

  // Wage-basis item code (see wage-basis.ts) → löneart in the payroll system.
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  salaryCodes: Record<string, string>;

  // Absence item code → PAXml frånvarokod (SJK, SEM, VAB …).
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  absenceCodes: Record<string, string>;

  // Agreement versions whose general wage raise this company has handled
  // (applied through raise proposals, or marked as handled). Others with a
  // raise show as pending in the lönerunderlag.
  @Prop({ type: [String], default: [] })
  handledRaises: string[];
}

export const PayrollSettingsSchema =
  SchemaFactory.createForClass(PayrollSettings);
