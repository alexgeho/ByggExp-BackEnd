import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

// Betalningsplan — a contract's value split into scheduled part-invoices
// (à conto) billed against milestones, ending with a final invoice.
export enum PaymentPlanRowStatus {
  Planned = "planned", // planerad
  Invoiced = "invoiced", // fakturerad
}

@Schema({ _id: false })
export class PaymentPlanRow {
  @Prop({ default: "" })
  description: string;

  // Fixed amount (ex VAT). If 0 and percent is set, the amount is derived from
  // the contract value.
  @Prop({ type: Number, default: 0 })
  amount: number;

  // Optional share of the contract value (e.g. 20 for 20%).
  @Prop({ type: Number, default: 0 })
  percent: number;

  @Prop({ default: "" })
  plannedDate: string;

  @Prop({
    enum: PaymentPlanRowStatus,
    default: PaymentPlanRowStatus.Planned,
  })
  status: PaymentPlanRowStatus;

  // The invoice raised for this milestone, once billed.
  @Prop({ type: Number, default: null })
  invoiceNumber?: number | null;

  @Prop({ default: "" })
  note: string;
}

const PaymentPlanRowSchema = SchemaFactory.createForClass(PaymentPlanRow);

export type PaymentPlanDocument = HydratedDocument<PaymentPlan>;

@Schema({ timestamps: true })
export class PaymentPlan {
  @Prop({ type: String, ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ type: String, ref: "Project", required: true, index: true })
  projectId: string;

  @Prop({ default: "Betalningsplan" })
  name: string;

  // Total contract value the plan bills against (ex VAT).
  @Prop({ type: Number, default: 0 })
  contractAmount: number;

  @Prop({ type: [PaymentPlanRowSchema], default: [] })
  rows: PaymentPlanRow[];

  @Prop({ default: "" })
  notes: string;

  @Prop({ type: String, ref: "User", default: null })
  createdByUserId?: string | null;
}

export const PaymentPlanSchema = SchemaFactory.createForClass(PaymentPlan);

PaymentPlanSchema.index({ projectId: 1, createdAt: -1 });
