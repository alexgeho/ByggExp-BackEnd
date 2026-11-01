import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

// Avvik (nb) / Avvikelse (sv) / Deviation (en): an HMS / quality / environment
// deviation on a project, with a responsible person, a due date and a closing.
// Norwegian internkontroll requires them to be recorded, followed up and closed.

export enum DeviationCategory {
  Hms = "hms", // nb HMS · sv Arbetsmiljö
  Quality = "quality", // Kvalitet
  Environment = "environment", // Miljø / Miljö
}

export enum DeviationSeverity {
  Low = "low", // lav / låg
  Medium = "medium", // middels / medel
  High = "high", // høy / hög
}

export enum DeviationStatus {
  Open = "open",
  InProgress = "in_progress",
  Closed = "closed",
}

export type DeviationSourceType = "checklist" | "dagbok";

@Schema({ _id: false })
export class DeviationPhoto {
  @Prop({ required: true })
  url: string;

  @Prop({ default: "" })
  name: string;

  @Prop({ type: Date, default: () => new Date() })
  uploadedAt: Date;

  @Prop({ type: String, default: null })
  uploadedByUserId?: string | null;
}
const DeviationPhotoSchema = SchemaFactory.createForClass(DeviationPhoto);

// Where the deviation came from (prefilled from a checklist remark or a dagbok
// entry's free-text avvik). Kept so both sides can link to each other.
@Schema({ _id: false })
export class DeviationSource {
  @Prop({ type: String, enum: ["checklist", "dagbok"], required: true })
  type: DeviationSourceType;

  @Prop({ required: true })
  id: string;

  @Prop({ type: Number, default: null })
  itemIndex?: number | null;
}
const DeviationSourceSchema = SchemaFactory.createForClass(DeviationSource);

export type DeviationHistoryAction =
  | "created"
  | "updated"
  | "status"
  | "closed"
  | "reopened"
  | "photos";

// One line of the deviation's own change log (Ändringslogg): who, when, what.
@Schema({ _id: false })
export class DeviationHistoryEntry {
  @Prop({ type: Date, default: () => new Date() })
  at: Date;

  @Prop({ type: String, default: null })
  userId?: string | null;

  @Prop({ default: "" })
  userName: string;

  @Prop({ type: String, required: true })
  action: DeviationHistoryAction;

  // [{ field, from, to }] for "updated"/"status".
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  changes: { field: string; from: unknown; to: unknown }[];

  @Prop({ default: "" })
  comment: string;
}
const DeviationHistorySchema = SchemaFactory.createForClass(
  DeviationHistoryEntry,
);

@Schema({ timestamps: true, collection: "deviations" })
export class Deviation {
  @Prop({ type: String, ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ type: String, ref: "Project", required: true, index: true })
  projectId: string;

  // Running number per company: «Avvik #12».
  @Prop({ type: Number, required: true })
  number: number;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: "" })
  description: string;

  @Prop({
    type: String,
    enum: DeviationCategory,
    default: DeviationCategory.Hms,
    index: true,
  })
  category: DeviationCategory;

  @Prop({
    type: String,
    enum: DeviationSeverity,
    default: DeviationSeverity.Medium,
  })
  severity: DeviationSeverity;

  // Where on site (free text: «Plan 2, trapphus B»).
  @Prop({ default: "" })
  location: string;

  @Prop({ type: [DeviationPhotoSchema], default: [] })
  photos: DeviationPhoto[];

  @Prop({ type: String, ref: "User", default: null })
  reportedByUserId?: string | null;

  @Prop({ default: "" })
  reportedByName: string;

  @Prop({ type: Date, default: () => new Date() })
  reportedAt: Date;

  @Prop({ type: String, ref: "User", default: null, index: true })
  responsibleUserId?: string | null;

  @Prop({ default: "" })
  responsibleName: string;

  @Prop({ type: Date, default: null, index: true })
  dueDate?: Date | null;

  // Årsak / Orsak (optional).
  @Prop({ default: "" })
  cause: string;

  // Tiltak / Åtgärd.
  @Prop({ default: "" })
  correctiveAction: string;

  @Prop({
    type: String,
    enum: DeviationStatus,
    default: DeviationStatus.Open,
    index: true,
  })
  status: DeviationStatus;

  @Prop({ type: String, ref: "User", default: null })
  closedByUserId?: string | null;

  @Prop({ default: "" })
  closedByName: string;

  @Prop({ type: Date, default: null })
  closedAt?: Date | null;

  @Prop({ default: "" })
  closingComment: string;

  @Prop({ type: DeviationSourceSchema, default: null })
  source?: DeviationSource | null;

  @Prop({ type: [DeviationHistorySchema], default: [] })
  history: DeviationHistoryEntry[];

  // Reminder bookkeeping: each reminder goes out once per due date.
  @Prop({ type: Date, default: null })
  dueSoonNotifiedAt?: Date | null;

  @Prop({ type: Date, default: null })
  overdueNotifiedAt?: Date | null;

  @Prop({ type: String, ref: "User", default: null })
  createdByUserId?: string | null;
}

export type DeviationDocument = HydratedDocument<Deviation>;
export const DeviationSchema = SchemaFactory.createForClass(Deviation);
DeviationSchema.index({ companyId: 1, number: 1 }, { unique: true });
DeviationSchema.index({ companyId: 1, projectId: 1, status: 1 });

// Per-company sequence for Deviation.number (atomic $inc, no race on create).
@Schema({ collection: "deviation_counters" })
export class DeviationCounter {
  @Prop({ required: true, unique: true })
  companyId: string;

  @Prop({ type: Number, default: 0 })
  seq: number;
}
export type DeviationCounterDocument = HydratedDocument<DeviationCounter>;
export const DeviationCounterSchema =
  SchemaFactory.createForClass(DeviationCounter);
