import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import {
  ChecklistCategory,
  ChecklistItemResult,
  ChecklistStatus,
} from "./checklist.enums";

// AI result for one control point, made from a site photo. Applied straight
// away ("auto": result/date/photo filled in) — the user can undo it (rejected)
// and still signs the checklist themselves. "pending" = legacy, not applied.
@Schema({ _id: false })
export class ChecklistItemSuggestion {
  @Prop({ type: String, enum: ChecklistItemResult, default: ChecklistItemResult.Ok })
  result: ChecklistItemResult;

  @Prop({ default: "" })
  date: string; // YYYY-MM-DD, from the photo's EXIF or upload time

  @Prop({ default: "" })
  photoUrl: string;

  @Prop({ default: "" })
  reason: string;

  @Prop({ default: 0 })
  confidence: number;

  @Prop({
    type: String,
    enum: ["pending", "auto", "accepted", "rejected"],
    default: "auto",
  })
  state: "pending" | "auto" | "accepted" | "rejected";
}

const ChecklistItemSuggestionSchema = SchemaFactory.createForClass(
  ChecklistItemSuggestion,
);

// A photo uploaded to an egenkontroll (proof from site).
@Schema({ _id: false })
export class ChecklistPhoto {
  @Prop({ required: true })
  url: string;

  @Prop({ default: "" })
  name: string;

  @Prop({ type: Date, default: null })
  takenAt?: Date | null;

  @Prop({ type: Number, default: null })
  lat?: number | null;

  @Prop({ type: Number, default: null })
  lng?: number | null;

  @Prop({ type: Date, default: () => new Date() })
  uploadedAt: Date;

  @Prop({ default: "" })
  uploadedByName: string;

  @Prop({ default: false })
  analyzed: boolean;
}

const ChecklistPhotoSchema = SchemaFactory.createForClass(ChecklistPhoto);

// A control point on a running egenkontroll.
@Schema({ _id: false })
export class ChecklistItem {
  @Prop({ default: "" })
  text: string;

  @Prop({ default: "" })
  reference: string;

  @Prop({ type: String, enum: ChecklistItemResult, default: ChecklistItemResult.Pending })
  result: ChecklistItemResult;

  @Prop({ default: "" })
  comment: string;

  // Date the point was checked (YYYY-MM-DD).
  @Prop({ default: "" })
  date: string;

  @Prop({ type: [String], default: [] })
  photoUrls: string[];

  @Prop({ type: ChecklistItemSuggestionSchema, default: null })
  suggestion?: ChecklistItemSuggestion | null;
}

const ChecklistItemSchema = SchemaFactory.createForClass(ChecklistItem);

export type ChecklistDocument = HydratedDocument<Checklist>;

// An egenkontroll instance run on a project, filled in and signed.
@Schema({ timestamps: true })
export class Checklist {
  @Prop({ type: String, ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ type: String, ref: "Project", required: true, index: true })
  projectId: string;

  @Prop({ type: String, ref: "ChecklistTemplate", default: null })
  templateId?: string | null;

  @Prop({ required: true })
  title: string;

  @Prop({ type: String, enum: ChecklistCategory, default: ChecklistCategory.Quality })
  category: ChecklistCategory;

  @Prop({ default: "" })
  date: string;

  // Ansvarig — person responsible for the control.
  @Prop({ default: "" })
  responsible: string;

  @Prop({ default: "" })
  notes: string;

  @Prop({ type: [ChecklistItemSchema], default: [] })
  items: ChecklistItem[];

  @Prop({ type: [ChecklistPhotoSchema], default: [] })
  photos: ChecklistPhoto[];

  // Contract / arbetsbeskrivning the points were generated from (AI draft).
  @Prop({ type: Object, default: null })
  sourceDocument?: { url: string; name: string } | null;

  @Prop({ type: String, enum: ChecklistStatus, default: ChecklistStatus.Draft, index: true })
  status: ChecklistStatus;

  @Prop({ default: "" })
  signedByName: string;

  @Prop({ type: String, ref: "User", default: null })
  signedByUserId?: string | null;

  @Prop({ type: Date, default: null })
  signedAt?: Date | null;

  @Prop({ type: String, ref: "User", default: null })
  createdByUserId?: string | null;
}

export const ChecklistSchema = SchemaFactory.createForClass(Checklist);

ChecklistSchema.index({ projectId: 1, createdAt: -1 });
