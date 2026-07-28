import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { ChecklistCategory } from "./checklist.enums";

// A reusable egenkontroll template (mall) — a named list of control points that
// can be instantiated onto any project.
@Schema({ _id: false })
export class ChecklistTemplateItem {
  @Prop({ default: "" })
  text: string;

  // Optional reference to a standard, drawing or requirement.
  @Prop({ default: "" })
  reference: string;
}

const ChecklistTemplateItemSchema = SchemaFactory.createForClass(
  ChecklistTemplateItem,
);

export type ChecklistTemplateDocument = HydratedDocument<ChecklistTemplate>;

@Schema({ timestamps: true })
export class ChecklistTemplate {
  @Prop({ type: String, ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ enum: ChecklistCategory, default: ChecklistCategory.Quality })
  category: ChecklistCategory;

  @Prop({ default: "" })
  description: string;

  @Prop({ type: [ChecklistTemplateItemSchema], default: [] })
  items: ChecklistTemplateItem[];

  @Prop({ type: String, ref: "User", default: null })
  createdByUserId?: string | null;
}

export const ChecklistTemplateSchema =
  SchemaFactory.createForClass(ChecklistTemplate);
