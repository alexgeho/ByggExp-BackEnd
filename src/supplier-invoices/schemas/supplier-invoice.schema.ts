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

  // Which reminder milestone was last sent for this bill (7 / 1 / 0 days left,
  // -1 = already overdue). Keeps the daily sweep from nagging twice for the same
  // milestone; reset when the due date moves or the bill is re-opened.
  @Prop({ type: Number, default: null })
  lastReminderBucket?: number | null;

  // Start-of-day timestamp of the last reminder, so an overdue bill nags once a
  // day rather than on every sweep.
  @Prop({ type: Number, default: null })
  lastReminderDay?: number | null;

  @Prop({ default: "" })
  category: string;

  // Payment references read from the invoice (used to pay it in the bank and to
  // build a bank payment file). OCR = the structured payment reference; bankgiro/
  // plusgiro = the supplier's giro number the payment is sent to.
  @Prop({ default: "" })
  ocr: string;

  @Prop({ default: "" })
  bankgiro: string;

  @Prop({ default: "" })
  plusgiro: string;

  // Foreign/SEPA payment details, read from invoices that pay via IBAN rather
  // than a Swedish giro number.
  @Prop({ default: "" })
  iban: string;

  @Prop({ default: "" })
  bic: string;

  // The currency the invoice is denominated in (ISO code). Defaults to SEK for
  // domestic bills; foreign supplier invoices are often EUR — amounts are stored
  // in this currency, not auto-converted to SEK.
  @Prop({ default: "SEK" })
  currency: string;

  @Prop({ type: Number, default: 0 })
  amountExclVat: number;

  @Prop({ type: Number, default: 0 })
  vat: number;

  @Prop({ type: Number, default: 0 })
  total: number;

  @Prop({ default: "" })
  notes: string;

  // How the invoice entered the system: "manual" (created/uploaded in the admin)
  // or "email" (auto-ingested from a forwarded invoice email). Used to flag
  // e-mailed invoices for review in the list.
  @Prop({ default: "manual" })
  source: string;

  // Uploaded scan/PDF of the supplier's invoice (the primary/original document).
  @Prop({ type: String, default: null })
  attachmentUrl?: string | null;

  // Extra files attached to the same invoice (e.g. a delivery note, a reminder,
  // a specification). The primary `attachmentUrl` above stays the main scan; all
  // of these are included when the originals are opened/downloaded.
  @Prop({ type: [String], default: [] })
  attachments: string[];

  @Prop({
    enum: SupplierInvoiceStatus,
    default: SupplierInvoiceStatus.Registered,
    index: true,
  })
  status: SupplierInvoiceStatus;

  // A credit note (kreditfaktura) received from the supplier: it reverses an
  // earlier bill, in full or in part, and carries negative amounts. These two
  // point back at the bill it settles.
  @Prop({ type: String, default: null, index: true })
  creditOfId?: string | null;

  @Prop({ default: "" })
  creditOfNumber?: string;

  @Prop({ type: String, ref: "User", default: null })
  createdByUserId?: string | null;

  @Prop({ type: Date, default: null })
  approvedAt?: Date | null;

  @Prop({ type: Date, default: null })
  paidAt?: Date | null;
}

export const SupplierInvoiceSchema =
  SchemaFactory.createForClass(SupplierInvoice);
