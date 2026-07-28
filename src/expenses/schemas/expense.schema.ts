import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

// Utlägg / kvitton — out-of-pocket or company-card expenses, typically
// photographed on site by a worker and reviewed by an admin.
export enum ExpenseStatus {
  Submitted = "submitted", // inskickad
  Approved = "approved", // godkänd
  Rejected = "rejected", // avvisad
  Reimbursed = "reimbursed", // utbetald (own money paid back)
}

export enum ExpensePaidBy {
  Own = "own", // worker's own money → needs reimbursement
  Company = "company", // company card → no reimbursement
}

export type ExpenseDocument = HydratedDocument<Expense>;

@Schema({ timestamps: true })
export class Expense {
  @Prop({ type: String, ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ type: String, ref: "Project", default: null, index: true })
  projectId?: string | null;

  // Who submitted the receipt.
  @Prop({ type: String, ref: "User", required: true, index: true })
  userId: string;

  @Prop({ default: "" })
  supplierName: string;

  @Prop({ default: "" })
  category: string;

  @Prop({ default: "" })
  date: string;

  @Prop({ default: "" })
  description: string;

  // Total on the receipt, incl. VAT.
  @Prop({ type: Number, default: 0 })
  amount: number;

  // VAT portion of the amount (for the ex-VAT project cost).
  @Prop({ type: Number, default: 0 })
  vat: number;

  @Prop({ enum: ExpensePaidBy, default: ExpensePaidBy.Own })
  paidBy: ExpensePaidBy;

  @Prop({ type: String, default: null })
  receiptUrl?: string | null;

  @Prop({ enum: ExpenseStatus, default: ExpenseStatus.Submitted, index: true })
  status: ExpenseStatus;

  @Prop({ type: Date, default: null })
  approvedAt?: Date | null;
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);
