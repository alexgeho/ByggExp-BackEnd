import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// Avtalsregler — one dated version of a collective agreement's pay rules
// (Byggavtalet first). The numbers are data, not code: when a new agreement is
// signed a superadmin publishes a new version with its own validFrom, and every
// period is calculated with the version that was in force on each day. Nothing
// here is ever guessed by the system — a version only counts once a person has
// checked it against the agreement text and published it.

export enum AgreementRuleSetStatus {
  Draft = 'draft',
  Published = 'published',
}

// Wage categories in Byggavtalet's minimum-wage table.
export enum WageCategory {
  Yrkesarbetare = 'yrkesarbetare',
  NyIBranschen = 'ny_i_branschen',
  Larling = 'larling',
  // Övriga arbetstagare 1 (≥ 12 mån i branschen): fördelningstal 0,88.
  Ovriga1 = 'ovriga_1',
  Other = 'other', // not covered by the agreement's minimum wage
}

@Schema({ _id: false })
export class MinimumWage {
  @Prop({ type: String, enum: WageCategory, required: true })
  category: WageCategory;

  @Prop({ default: '' })
  label: string;

  // Lowest allowed hourly wage (SEK) for the category.
  @Prop({ type: Number, required: true })
  hourly: number;
}
export const MinimumWageSchema = SchemaFactory.createForClass(MinimumWage);

// Supplement paid on top of the base hourly wage for an hour type reported on
// the shift (overtime, OB …): either a percentage of the worker's hourly wage
// or a fixed SEK amount per hour.
@Schema({ _id: false })
export class HourTypeSupplement {
  @Prop({ required: true })
  hourType: string; // matches Shift.hourType: overtime | ob | …

  @Prop({ default: '' })
  label: string;

  @Prop({ type: String, enum: ['percent', 'fixed'], default: 'percent' })
  kind: 'percent' | 'fixed';

  @Prop({ type: Number, default: 0 })
  value: number;
}
export const HourTypeSupplementSchema =
  SchemaFactory.createForClass(HourTypeSupplement);

export type AgreementRuleSetDocument = HydratedDocument<AgreementRuleSet>;

@Schema({ timestamps: true })
export class AgreementRuleSet {
  @Prop({ default: 'byggavtalet', index: true })
  agreement: string;

  @Prop({ required: true })
  name: string;

  // YYYY-MM-DD, inclusive. Empty validTo = open-ended (until the next version).
  @Prop({ required: true, index: true })
  validFrom: string;

  @Prop({ default: '' })
  validTo: string;

  @Prop({
    type: String,
    enum: AgreementRuleSetStatus,
    default: AgreementRuleSetStatus.Draft,
    index: true,
  })
  status: AgreementRuleSetStatus;

  // Where the numbers come from (agreement section, BI/Byggnads circular,
  // Skatteverket page) — shown next to every figure in the admin.
  @Prop({ default: '' })
  sourceNote: string;

  @Prop({ type: [MinimumWageSchema], default: [] })
  minimumWages: MinimumWage[];

  @Prop({ type: [HourTypeSupplementSchema], default: [] })
  hourTypeSupplements: HourTypeSupplement[];

  // Semesterlön/semesterersättning as a percentage of earned pay. null = not
  // calculated by ByggExp (the payroll system computes it from the employee's settings).
  @Prop({ type: Number, default: null })
  vacationPayPercent: number | null;

  // Bilersättning per km and the tax-free part of it (Skatteverket).
  @Prop({ type: Number, default: 0 })
  mileageRatePerKm: number;

  @Prop({ type: Number, default: 0 })
  mileageTaxFreePerKm: number;

  // Restidsersättning per hour of travel time.
  @Prop({ type: Number, default: 0 })
  travelTimeRatePerHour: number;

  // Traktamente per day and Skatteverket's tax-free normalbelopp.
  @Prop({ type: Number, default: 0 })
  perDiemFull: number;

  @Prop({ type: Number, default: 0 })
  perDiemHalf: number;

  @Prop({ type: Number, default: 0 })
  perDiemTaxFreeFull: number;

  @Prop({ type: Number, default: 0 })
  perDiemTaxFreeHalf: number;

  // General raise of every covered worker's own hourly wage from validFrom
  // (Byggavtalet: e.g. "+6,85 kr/tim from 1 May"). kind null = no raise in this
  // version. Applied per company through raise proposals, never silently.
  @Prop({ type: String, enum: ['percent', 'fixed'], default: null })
  wageRaiseKind: 'percent' | 'fixed' | null;

  @Prop({ type: Number, default: 0 })
  wageRaiseValue: number;

  // Arbetstidsförkortning (ATK) accrued as a percentage of earned pay.
  // null = not accrued by ByggExp.
  @Prop({ type: Number, default: null })
  atkPercent: number | null;

  // Figures were read from a document by AI; publishing then requires an
  // explicit "I have checked every figure" confirmation.
  @Prop({ type: Boolean, default: false })
  aiDraft: boolean;

  @Prop({ type: String, ref: 'User', default: null })
  publishedByUserId?: string | null;

  @Prop({ type: Date, default: null })
  publishedAt?: Date | null;
}

export const AgreementRuleSetSchema =
  SchemaFactory.createForClass(AgreementRuleSet);

AgreementRuleSetSchema.index({ agreement: 1, status: 1, validFrom: -1 });
