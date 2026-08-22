import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type InvoiceDocument = Invoice & Document;

export enum InvoiceStatus {
  Draft = "draft",
  Sent = "sent",
  Paid = "paid",
  Overdue = "overdue",
  Cancelled = "cancelled",
}

@Schema({ _id: false })
export class InvoiceItem {
  @Prop({ default: "" })
  articleNumber?: string;

  @Prop({ default: "" })
  description?: string;

  @Prop({ type: Number, default: 1 })
  quantity?: number;

  @Prop({ default: "st" })
  unit?: string;

  @Prop({ type: Number, default: 0 })
  price?: number;

  @Prop({ type: Number, default: 0 })
  discount?: number;

  @Prop({ type: Number, default: 25 })
  vatRate?: number;
}

const InvoiceItemSchema = SchemaFactory.createForClass(InvoiceItem);

@Schema({ _id: false })
export class InvoiceCompanyFooter {
  @Prop({ default: "" })
  name?: string;

  @Prop({ default: "" })
  address?: string;

  @Prop({ default: "" })
  city?: string;

  @Prop({ default: "" })
  phone?: string;

  @Prop({ default: "" })
  email?: string;

  @Prop({ default: "" })
  website?: string;

  @Prop({ default: "" })
  orgNumber?: string;

  @Prop({ default: "" })
  vatNumber?: string;

  @Prop({ default: "Godkänd för F-skatt" })
  vatStatus?: string;

  @Prop({ default: "" })
  bankgiro?: string;

  @Prop({ default: "" })
  plusgiro?: string;
}

const InvoiceCompanyFooterSchema =
  SchemaFactory.createForClass(InvoiceCompanyFooter);

@Schema({ timestamps: true, strict: false })
export class Invoice {
  @Prop({ ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ type: String, ref: "Project", index: true, default: null })
  projectId?: string | null;

  @Prop({ ref: "User", required: true })
  createdByUserId: string;

  @Prop({ type: Number, required: true })
  invoiceNumber: number;

  @Prop({ default: "" })
  ocr: string;

  @Prop({ default: "" })
  orderReference: string;

  @Prop({ default: "" })
  companyName: string;

  @Prop({ default: "" })
  customerNumber: string;

  @Prop({ default: "" })
  vatNumber: string;

  @Prop({ default: "" })
  address: string;

  @Prop({ default: "" })
  postalCode: string;

  @Prop({ default: "" })
  representative: string;

  @Prop({ default: "" })
  email: string;

  @Prop({ default: "" })
  phone: string;

  @Prop({ default: "" })
  date: string;

  @Prop({ default: "" })
  dueDate: string;

  @Prop({ default: "" })
  deliveryDate: string;

  @Prop({ default: "" })
  paymentTerms: string;

  @Prop({ default: "" })
  lateInterest: string;

  @Prop({ default: "" })
  ourReference: string;

  @Prop({ default: "" })
  yourReference: string;

  @Prop({ default: "false" })
  reverseVAT: string;

  @Prop({ type: String, default: null })
  logoUrl?: string | null;

  @Prop({ type: [InvoiceItemSchema], default: [] })
  items: InvoiceItem[];

  @Prop({ type: Number, default: 0 })
  subtotal: number;

  @Prop({ type: Number, default: 0 })
  vat: number;

  @Prop({ type: Number, default: 0 })
  total: number;

  // Öresavrundning: rounding of the grand total to the nearest whole krona and
  // the resulting rounded amount to pay.
  @Prop({ type: Number, default: 0 })
  rounding: number;

  @Prop({ type: Number, default: 0 })
  roundedTotal: number;

  // ROT-avdrag (tax deduction for labour on private homes). rotDeduction is the
  // amount subtracted from what the customer pays; the state pays it to you.
  @Prop({ type: Boolean, default: false })
  rotEnabled: boolean;

  @Prop({ default: '' })
  rotPersonalNumber: string;

  @Prop({ default: '' })
  rotProperty: string;

  @Prop({ type: Number, default: 0 })
  rotLaborAmount: number;

  @Prop({ type: Number, default: 0 })
  rotDeduction: number;

  // Credit note (kreditfaktura): when set, this invoice reverses another.
  @Prop({ type: String, ref: 'Invoice', default: null })
  creditOfId?: string | null;

  @Prop({ type: Number, default: null })
  creditOfNumber?: number | null;

  @Prop({ enum: InvoiceStatus, default: InvoiceStatus.Draft })
  status: InvoiceStatus;

  @Prop({ type: Date, default: null })
  sentAt?: Date | null;

  @Prop({ type: Date, default: null })
  paidAt?: Date | null;

  @Prop({ type: InvoiceCompanyFooterSchema, default: () => ({}) })
  companyFooter: InvoiceCompanyFooter;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

InvoiceSchema.index({ companyId: 1, invoiceNumber: 1 }, { unique: true });
