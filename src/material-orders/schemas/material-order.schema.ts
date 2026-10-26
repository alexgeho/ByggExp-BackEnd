import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type MaterialOrderDocument = MaterialOrder & Document;

export enum MaterialOrderStatus {
  Draft = "draft",
  Sent = "sent",
}

@Schema({ _id: false })
export class MaterialOrderRow {
  // Register article the row was picked from (optional — free rows allowed).
  @Prop({ type: String, ref: "Article", default: null })
  articleId?: string | null;

  @Prop({ default: "" })
  articleNumber: string;

  @Prop({ default: "" })
  name: string;

  @Prop({ default: "st" })
  unit: string;

  @Prop({ type: Number, required: true })
  quantity: number;

  // Purchase price at order time (for reference / project cost), excl. moms.
  @Prop({ type: Number, default: 0 })
  unitPrice: number;
}
export const MaterialOrderRowSchema =
  SchemaFactory.createForClass(MaterialOrderRow);

// Materialbeställning — one order to one grossist (Lundagrossisten, Ahlsell…)
// for one project. Draft until an admin sends it (email today, EDI later).
@Schema({ timestamps: true })
export class MaterialOrder {
  @Prop({ required: true, ref: "Company", index: true })
  companyId: string;

  @Prop({ required: true, ref: "Project", index: true })
  projectId: string;

  @Prop({ type: Number, default: 0 })
  orderNumber: number;

  @Prop({ required: true })
  supplier: string;

  @Prop({ type: [MaterialOrderRowSchema], default: [] })
  rows: MaterialOrderRow[];

  @Prop({ default: "" })
  deliveryAddress: string;

  @Prop({ type: Date, default: null })
  desiredDate?: Date | null;

  @Prop({ default: "" })
  comment: string;

  @Prop({
    type: String,
    enum: MaterialOrderStatus,
    default: MaterialOrderStatus.Draft,
    index: true,
  })
  status: MaterialOrderStatus;

  @Prop({ type: String, ref: "User", required: true })
  createdBy: string;

  @Prop({ type: Date, default: null })
  sentAt?: Date | null;

  @Prop({ type: String, ref: "User", default: null })
  sentBy?: string | null;

  @Prop({ default: "" })
  sentTo: string;

  // "email" today; "edi" once a supplier agreement exists.
  @Prop({ default: "" })
  sentVia: string;
}

export const MaterialOrderSchema = SchemaFactory.createForClass(MaterialOrder);
MaterialOrderSchema.index({ companyId: 1, projectId: 1, createdAt: -1 });
