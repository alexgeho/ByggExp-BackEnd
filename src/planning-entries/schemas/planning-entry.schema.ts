import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type PlanningEntryDocument = HydratedDocument<PlanningEntry>;

// A manually-entered upcoming cash-flow item on the financial-planning page —
// money expected IN ("in") or OUT ("out") that is NOT (yet) a real invoice.
// Shown alongside the invoice-derived rows and counted in the forecast/KPIs.
@Schema({ timestamps: true })
export class PlanningEntry {
  @Prop({ type: String, ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ type: String, enum: ["in", "out"], required: true, index: true })
  direction: "in" | "out";

  @Prop({ default: "" })
  name: string; // supplier (out) or customer (in)

  @Prop({ default: "" })
  dueDate: string; // YYYY-MM-DD

  @Prop({ type: Number, default: 0 })
  amount: number; // incl VAT, in the company currency

  @Prop({ default: "" })
  ocr: string;

  @Prop({ default: "" })
  bankgiro: string;

  @Prop({ default: "" })
  note: string;

  @Prop({ type: String, ref: "User", default: null })
  createdByUserId?: string | null;
}

export const PlanningEntrySchema = SchemaFactory.createForClass(PlanningEntry);
PlanningEntrySchema.index({ companyId: 1, dueDate: 1 });
