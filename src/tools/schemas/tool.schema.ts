import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type ToolDocument = Tool & Document;

@Schema({ timestamps: true })
export class Tool {
  @Prop({ required: true })
  name: string;

  @Prop({ default: "" })
  photoUrl: string;

  @Prop({ type: [String], default: [] })
  photoUrls: string[];

  @Prop({ default: "" })
  notes: string;

  @Prop({
    enum: ["available", "broken", "in_repair", "occupied"],
    default: "available",
  })
  status: string;

  @Prop({ type: [String], default: [] })
  workerIds: string[];

  @Prop({ type: [String], default: [] })
  projectIds: string[];

  @Prop({ ref: "Company" })
  companyId?: string;

  // Short code printed on the QR label stuck to the tool (e.g. "TL-4K9Q2X").
  @Prop({ type: String, default: null, index: true })
  qrId?: string | null;

  // Where the tool currently is (site, van, storage…).
  @Prop({ default: "" })
  location: string;

  // Who currently holds the tool (single responsible person after a hand-off).
  @Prop({ type: String, ref: "User", default: null })
  currentHolderId?: string | null;

  @Prop({ default: "" })
  lastInspectionDate: string;

  @Prop({ default: "" })
  nextInspectionDate: string;
}

export const ToolSchema = SchemaFactory.createForClass(Tool);
