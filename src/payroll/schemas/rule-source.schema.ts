import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// A web page ByggExp watches for changes that can affect pay rules: Byggnads'
// agreement pages, Skatteverket's per diem / employer fee / AGI pages. A change
// does not change any rule by itself — it alerts a superadmin, who reviews it
// and, when needed, publishes a new agreement version.
export type RuleSourceDocument = HydratedDocument<RuleSource>;

export const RULE_SOURCE_AREAS = [
  'agreement', // Byggavtalet: wages, supplements
  'tax', // tax tables, per diem, mileage, employer fees
  'agi', // arbetsgivardeklaration format
] as const;
export type RuleSourceArea = (typeof RULE_SOURCE_AREAS)[number];

@Schema({ timestamps: true })
export class RuleSource {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  url: string;

  @Prop({ type: String, enum: RULE_SOURCE_AREAS, default: 'agreement' })
  area: RuleSourceArea;

  @Prop({ type: Boolean, default: true })
  enabled: boolean;

  // sha256 of the page's visible text at the last check.
  @Prop({ default: '' })
  lastHash: string;

  // A short excerpt of the text at the last check, to show what it says now.
  @Prop({ default: '' })
  lastExcerpt: string;

  @Prop({ type: Date, default: null })
  lastCheckedAt?: Date | null;

  @Prop({ type: Date, default: null })
  lastChangedAt?: Date | null;

  @Prop({ default: '' })
  lastError: string;

  // Set when a change has been seen and not yet reviewed by a superadmin.
  @Prop({ type: Boolean, default: false })
  needsReview: boolean;

  @Prop({ type: Date, default: null })
  reviewedAt?: Date | null;

  @Prop({ type: String, ref: 'User', default: null })
  reviewedByUserId?: string | null;

  // Agreement PDFs linked from the page, so a new or changed document is
  // read into a draft once.
  @Prop({
    type: [{ url: String, hash: String, seenAt: Date, _id: false }],
    default: [],
  })
  documents: { url: string; hash: string; seenAt: Date }[];

  // Set after the first look at the page's documents (that look only records
  // them).
  @Prop({ type: Date, default: null })
  documentsBaselinedAt?: Date | null;
}

export const RuleSourceSchema = SchemaFactory.createForClass(RuleSource);
