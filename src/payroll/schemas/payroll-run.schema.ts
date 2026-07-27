import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum PayrollStatus {
  Draft = 'draft',
  Approved = 'approved',
  Paid = 'paid',
}

// One worker's line in a payroll run. Rate is snapshotted at run time so later
// rate changes don't rewrite historical runs.
@Schema({ _id: false })
export class PayrollLine {
  @Prop({ type: String, required: true })
  userId: string;

  @Prop({ default: '' })
  name: string;

  @Prop({ type: Number, default: 0 })
  hours: number;

  @Prop({ type: Number, default: 0 })
  rate: number;

  @Prop({ type: Number, default: 0 })
  amount: number;
}

export const PayrollLineSchema = SchemaFactory.createForClass(PayrollLine);

export type PayrollRunDocument = HydratedDocument<PayrollRun>;

@Schema({ timestamps: true })
export class PayrollRun {
  @Prop({ type: String, ref: 'Company', required: true, index: true })
  companyId: string;

  // Period the hours were worked in, as plain YYYY-MM-DD strings (same format as
  // the Hours grid and invoice dates).
  @Prop({ required: true })
  periodFrom: string;

  @Prop({ required: true })
  periodTo: string;

  // Which measure the hours came from: contracted "planned" or measured "actual".
  @Prop({ default: 'planned' })
  basis: string;

  @Prop({ type: String, ref: 'Project', default: null })
  projectId?: string | null;

  @Prop({ enum: PayrollStatus, default: PayrollStatus.Draft, index: true })
  status: PayrollStatus;

  @Prop({ type: [PayrollLineSchema], default: [] })
  lines: PayrollLine[];

  @Prop({ type: Number, default: 0 })
  totalHours: number;

  @Prop({ type: Number, default: 0 })
  totalAmount: number;

  @Prop({ type: String, ref: 'User', default: null })
  createdByUserId?: string | null;

  @Prop({ type: Date, default: null })
  approvedAt?: Date | null;

  @Prop({ type: Date, default: null })
  paidAt?: Date | null;
}

export const PayrollRunSchema = SchemaFactory.createForClass(PayrollRun);
