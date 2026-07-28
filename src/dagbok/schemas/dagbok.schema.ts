import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

// Dagbok — the construction site diary. One or more entries per project per
// day: weather, crew on site, work performed, deviations and photos. Expected
// on larger contracts (AB04/ABT06) and a useful record in disputes.
export type DagbokDocument = HydratedDocument<DagbokEntry>;

@Schema({ timestamps: true })
export class DagbokEntry {
  @Prop({ type: String, ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ type: String, ref: "Project", required: true, index: true })
  projectId: string;

  @Prop({ default: "" })
  date: string;

  @Prop({ default: "" })
  weather: string;

  @Prop({ default: "" })
  temperature: string;

  // How many workers were on site.
  @Prop({ type: Number, default: 0 })
  crewCount: number;

  // Who was on site (free text or names).
  @Prop({ default: "" })
  personnel: string;

  // Utfört arbete.
  @Prop({ default: "" })
  workPerformed: string;

  // Avvikelser / hinder.
  @Prop({ default: "" })
  deviations: string;

  // Leveranser / material.
  @Prop({ default: "" })
  materials: string;

  @Prop({ default: "" })
  notes: string;

  @Prop({ type: [String], default: [] })
  photoUrls: string[];

  @Prop({ type: String, ref: "User", default: null })
  createdByUserId?: string | null;
}

export const DagbokSchema = SchemaFactory.createForClass(DagbokEntry);

DagbokSchema.index({ projectId: 1, date: -1 });
