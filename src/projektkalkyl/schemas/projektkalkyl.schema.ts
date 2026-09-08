import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type ProjektkalkylDocument = Projektkalkyl & Document;

// A free-form project calculation row: a manually entered income or cost line.
@Schema({ _id: false })
export class KalkylRow {
  @Prop({ default: "" })
  description?: string;

  // "income" (intäkt) or "cost" (kostnad).
  @Prop({ default: "cost" })
  type: string;

  @Prop({ default: "" })
  category?: string;

  @Prop({ type: Number, default: 0 })
  amount: number;
}

export const KalkylRowSchema = SchemaFactory.createForClass(KalkylRow);

// A standalone project calculation (budget sheet) the user fills in by hand —
// income/cost rows with a live result. Independent of operational projects.
@Schema({ timestamps: true })
export class Projektkalkyl {
  @Prop({ ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ ref: "User", required: true })
  createdByUserId: string;

  @Prop({ default: "" })
  name: string;

  @Prop({ default: "" })
  note?: string;

  // "ex" (exkl. moms) or "inkl" (inkl. moms) — how the amounts are entered.
  @Prop({ default: "ex" })
  momsMode: string;

  @Prop({ type: [KalkylRowSchema], default: [] })
  rows: KalkylRow[];
}

export const ProjektkalkylSchema = SchemaFactory.createForClass(Projektkalkyl);

ProjektkalkylSchema.index({ companyId: 1, createdAt: -1 });
