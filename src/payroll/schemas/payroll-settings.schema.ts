import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

// Per-company payroll settings for the lönerunderlag export: which löneart /
// frånvarokod each ByggExp item maps to in the company's Fortnox Lön. Löneart
// numbers differ between Fortnox accounts, so they are never hard-coded — an
// item with no code mapped is left out of the export and flagged in the preview.
export type PayrollSettingsDocument = HydratedDocument<PayrollSettings>;

@Schema({ timestamps: true })
export class PayrollSettings {
  @Prop({ type: String, ref: 'Company', required: true, unique: true })
  companyId: string;

  @Prop({ default: 'byggavtalet' })
  agreement: string;

  // Wage-basis item code (see wage-basis.ts) → Fortnox löneart.
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  salaryCodes: Record<string, string>;

  // Absence item code → PAXml/Fortnox frånvarokod (SJK, SEM, VAB …).
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  absenceCodes: Record<string, string>;

  // Only attested shifts (approvedAt set) count towards the lönerunderlag.
  @Prop({ type: Boolean, default: true })
  onlyApprovedShifts: boolean;
}

export const PayrollSettingsSchema =
  SchemaFactory.createForClass(PayrollSettings);
