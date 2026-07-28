import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import {
  ChecklistCategory,
  ChecklistItemResult,
  ChecklistStatus,
} from "./checklist.enums";

// A control point on a running egenkontroll.
@Schema({ _id: false })
export class ChecklistItem {
  @Prop({ default: "" })
  text: string;

  @Prop({ default: "" })
  reference: string;

  @Prop({ enum: ChecklistItemResult, default: ChecklistItemResult.Pending })
  result: ChecklistItemResult;

  @Prop({ default: "" })
  comment: string;
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

  @Prop({ enum: ChecklistCategory, default: ChecklistCategory.Quality })
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

  @Prop({ enum: ChecklistStatus, default: ChecklistStatus.Draft, index: true })
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
