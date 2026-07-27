import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export enum SupplierInvoiceStatus {
  Registered = "registered",
  Approved = "approved",
  Paid = "paid",
}

export type SupplierInvoiceDocument = HydratedDocument<SupplierInvoice>;

@Schema({ timestamps: true })
export class SupplierInvoice {
  @Prop({ type: String, ref: "Company", required: true, index: true })
  companyId: string;

  // Which project the cost belongs to (nullable — overhead not tied to a job).
  @Prop({ type: String, ref: "Project", default: null, index: true })
  projectId?: string | null;

  @Prop({ default: "" })
  supplierName: string;

  @Prop({ default: "" })
  supplierOrgNumber: string;

  @Prop({ default: "" })
  invoiceNumber: string;

  @Prop({ default: "" })
  invoiceDate: string;

  @Prop({ default: "" })
  dueDate: string;

  @Prop({ default: "" })
  category: string;

  @Prop({ type: Number, default: 0 })
  amountExclVat: number;

  @Prop({ type: Number, default: 0 })
  vat: number;

  @Prop({ type: Number, default: 0 })
  total: number;

  @Prop({ default: "" })
  notes: string;

  // Uploaded scan/PDF of the supplier's invoice.
  @Prop({ type: String, default: null })
  attachmentUrl?: string | null;

  @Prop({
    enum: SupplierInvoiceStatus,
    default: SupplierInvoiceStatus.Registered,
    index: true,
  })
  status: SupplierInvoiceStatus;

  @Prop({ type: String, ref: "User", default: null })
  createdByUserId?: string | null;

  @Prop({ type: Date, default: null })
  approvedAt?: Date | null;

  @Prop({ type: Date, default: null })
  paidAt?: Date | null;
}

export const SupplierInvoiceSchema =
  SchemaFactory.createForClass(SupplierInvoice);
