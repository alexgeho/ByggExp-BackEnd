import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

// One downloaded lönerunderlag file: which period and which workers went to
// the payroll system. Lets the admin see who is already exported and whether
// their shifts changed afterwards, so nobody is paid twice.
export type PayrollExportDocument = HydratedDocument<PayrollExport>;

@Schema({ timestamps: true })
export class PayrollExport {
  @Prop({ type: String, ref: "Company", required: true, index: true })
  companyId: string;

  // YYYY-MM-DD, inclusive.
  @Prop({ required: true })
  from: string;

  @Prop({ required: true })
  to: string;

  // Workers whose rows are in the file.
  @Prop({ type: [String], default: [] })
  userIds: string[];

  @Prop({ type: String, default: "paxml" })
  format: string;

  @Prop({ type: String, ref: "User", default: null })
  exportedByUserId?: string | null;

  createdAt?: Date;
}

export const PayrollExportSchema = SchemaFactory.createForClass(PayrollExport);

PayrollExportSchema.index({ companyId: 1, from: 1, to: 1 });
