import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type MaterialSupplierDocument = MaterialSupplier & Document;

// Company-level ordering settings per grossist: where orders go and which
// customer number (kundnummer) the company has there.
@Schema({ timestamps: true })
export class MaterialSupplier {
  @Prop({ required: true, ref: "Company", index: true })
  companyId: string;

  @Prop({ required: true })
  supplier: string;

  @Prop({ default: "" })
  orderEmail: string;

  @Prop({ default: "" })
  customerNumber: string;
}

export const MaterialSupplierSchema =
  SchemaFactory.createForClass(MaterialSupplier);
MaterialSupplierSchema.index({ companyId: 1, supplier: 1 }, { unique: true });
