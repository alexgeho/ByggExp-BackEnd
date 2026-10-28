import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { EMPLOYER_FEE_GENERAL } from "../employer-fee";

// basis of a run entered by hand on Löner → Ny lönekörning (no shifts). The
// hours grid's own "manual" measure stays "manual" and is not editable here.
export const ENTERED_BASIS = "entered";

export enum PayrollStatus {
  Draft = "draft",
  Approved = "approved",
  Paid = "paid",
}

// One row of a manually entered line: hours × timlön (normal / overtime / ob)
// or a fixed amount (monthly = månadslön, other = bonus/avdrag).
@Schema({ _id: false })
export class PayrollItem {
  @Prop({ required: true })
  type: string;

  @Prop({ default: "" })
  label: string;

  @Prop({ type: Number, default: 0 })
  hours: number;

  @Prop({ type: Number, default: 0 })
  rate: number;

  @Prop({ type: Number, default: 1 })
  multiplier: number;

  @Prop({ type: Number, default: 0 })
  amount: number;
}

export const PayrollItemSchema = SchemaFactory.createForClass(PayrollItem);

// One worker's line in a payroll run. Rate is snapshotted at run time so later
// rate changes don't rewrite historical runs.
@Schema({ _id: false })
export class PayrollLine {
  @Prop({ type: String, required: true })
  userId: string;

  @Prop({ default: "" })
  name: string;

  @Prop({ type: Number, default: 0 })
  hours: number;

  @Prop({ type: Number, default: 0 })
  rate: number;

  // Pay multiplier for the hour type: 1 = normal, >1 = OB-tillägg / overtime.
  @Prop({ type: Number, default: 1 })
  multiplier: number;

  @Prop({ default: "normal" })
  hourType: string;

  // amount = gross = hours × rate × multiplier.
  @Prop({ type: Number, default: 0 })
  amount: number;

  @Prop({ type: Number, default: 0 })
  tax: number;

  @Prop({ type: Number, default: 0 })
  net: number;

  // How `tax` was withheld: the worker's Skatteverket table/column, or the
  // flat percentage when no table applied. Null on runs made before this was
  // stored.
  @Prop({ type: Number, default: null })
  taxTable?: number | null;

  @Prop({ type: Number, default: null })
  taxColumn?: number | null;

  @Prop({ type: Number, default: null })
  taxPercent?: number | null;

  // Arbetsgivaravgift for this worker (age-based rate, see employer-fee.ts).
  // Null on older runs — those use the run's employerRate.
  @Prop({ type: Number, default: null })
  employerRate?: number | null;

  @Prop({ type: Number, default: null })
  employerFee?: number | null;

  // Manual runs only: the rows behind amount (empty for runs from the hours
  // grid). hours/rate/amount above stay the line totals either way, so AGI,
  // payslip and exports read the same fields.
  @Prop({ type: [PayrollItemSchema], default: [] })
  items: PayrollItem[];
}

export const PayrollLineSchema = SchemaFactory.createForClass(PayrollLine);

export type PayrollRunDocument = HydratedDocument<PayrollRun>;

@Schema({ timestamps: true })
export class PayrollRun {
  @Prop({ type: String, ref: "Company", required: true, index: true })
  companyId: string;

  // Period the hours were worked in, as plain YYYY-MM-DD strings (same format as
  // the Hours grid and invoice dates).
  @Prop({ required: true })
  periodFrom: string;

  @Prop({ required: true })
  periodTo: string;

  // Where the hours came from: the hours grid's "planned", "actual" (GPS) or
  // "manual" measure, or "entered" (ENTERED_BASIS) = typed in on Löner.
  @Prop({ default: "planned" })
  basis: string;

  @Prop({ type: String, ref: "Project", default: null })
  projectId?: string | null;

  @Prop({
    type: String,
    enum: PayrollStatus,
    default: PayrollStatus.Draft,
    index: true,
  })
  status: PayrollStatus;

  @Prop({ type: [PayrollLineSchema], default: [] })
  lines: PayrollLine[];

  @Prop({ type: Number, default: 0 })
  totalHours: number;

  @Prop({ type: Number, default: 0 })
  totalAmount: number;

  // Preliminär skatt (simplified flat rate applied to every line's gross).
  @Prop({ type: Number, default: 30 })
  taxRate: number;

  @Prop({ type: Number, default: 0 })
  totalGross: number;

  @Prop({ type: Number, default: 0 })
  totalTax: number;

  @Prop({ type: Number, default: 0 })
  totalNet: number;

  // Arbetsgivaravgift (employer social fees) — the general rate; lines carry
  // their own (age-based) rate and fee.
  @Prop({ type: Number, default: EMPLOYER_FEE_GENERAL })
  employerRate: number;

  @Prop({ type: Number, default: 0 })
  employerContribution: number;

  @Prop({ type: Number, default: 0 })
  totalEmployerCost: number;

  @Prop({ type: String, ref: "User", default: null })
  createdByUserId?: string | null;

  @Prop({ type: Date, default: null })
  approvedAt?: Date | null;

  @Prop({ type: Date, default: null })
  paidAt?: Date | null;
}

export const PayrollRunSchema = SchemaFactory.createForClass(PayrollRun);
