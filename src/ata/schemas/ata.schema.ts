import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

// ÄTA = Ändrings-, Tilläggs- och Avgående arbeten (changes/additions/deductions
// to the contracted scope under AB04/ABT06).
export enum AtaType {
  Change = "change", // Ändring
  Addition = "addition", // Tillägg
  Deduction = "deduction", // Avgående
}

export enum AtaStatus {
  Registered = "registered", // registrerad (draft)
  Sent = "sent", // skickad till beställare
  Approved = "approved", // godkänd
  Rejected = "rejected", // avvisad
  Invoiced = "invoiced", // fakturerad
}

export type AtaDocument = HydratedDocument<Ata>;

@Schema({ timestamps: true })
export class Ata {
  @Prop({ type: String, ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ type: String, ref: "Project", required: true, index: true })
  projectId: string;

  // Sequential per project (ÄTA #1, #2 …).
  @Prop({ type: Number, required: true })
  number: number;

  @Prop({ enum: AtaType, default: AtaType.Addition })
  type: AtaType;

  @Prop({ default: "" })
  title: string;

  @Prop({ default: "" })
  description: string;

  @Prop({ default: "" })
  date: string;

  // Ex-VAT price. Positive for tillägg, negative for avgående.
  @Prop({ type: Number, default: 0 })
  amount: number;

  @Prop({ default: "" })
  notes: string;

  @Prop({ type: String, default: null })
  attachmentUrl?: string | null;

  @Prop({ enum: AtaStatus, default: AtaStatus.Registered, index: true })
  status: AtaStatus;

  @Prop({ type: String, ref: "User", default: null })
  createdByUserId?: string | null;

  @Prop({ type: Date, default: null })
  approvedAt?: Date | null;

  @Prop({ type: String, ref: "Invoice", default: null })
  invoicedInvoiceId?: string | null;
}

export const AtaSchema = SchemaFactory.createForClass(Ata);

AtaSchema.index({ projectId: 1, number: 1 }, { unique: true });
