import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

// Bokföring: one fiscal year per company (chart of accounts + opening
// balances) and its verifications. Filled by SIE4 import; re-importing a year
// replaces it.

type Amount = { account: number; amount: number };

@Schema({ timestamps: true })
export class LedgerYear {
  @Prop({ type: String, ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ required: true })
  start: string; // YYYY-MM-DD

  @Prop({ required: true })
  end: string;

  @Prop({ type: [{ account: Number, name: String, _id: false }], default: [] })
  accounts: { account: number; name: string }[];

  @Prop({
    type: [{ account: Number, amount: Number, _id: false }],
    default: [],
  })
  ib: Amount[];

  @Prop({ default: "" })
  source: string; // file name it came from
}
export type LedgerYearDocument = HydratedDocument<LedgerYear>;
export const LedgerYearSchema = SchemaFactory.createForClass(LedgerYear);
LedgerYearSchema.index({ companyId: 1, start: 1 }, { unique: true });

@Schema({ timestamps: true })
export class LedgerVerification {
  @Prop({ type: String, ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ required: true })
  yearStart: string;

  @Prop({ default: "" })
  series: string;

  @Prop({ default: "" })
  number: string;

  @Prop({ required: true })
  date: string; // YYYY-MM-DD

  @Prop({ default: "" })
  text: string;

  @Prop({
    type: [{ account: Number, amount: Number, text: String, _id: false }],
    default: [],
  })
  trans: { account: number; amount: number; text?: string }[];
}
export type LedgerVerificationDocument = HydratedDocument<LedgerVerification>;
export const LedgerVerificationSchema =
  SchemaFactory.createForClass(LedgerVerification);
LedgerVerificationSchema.index({ companyId: 1, yearStart: 1, date: 1 });
LedgerVerificationSchema.index({ companyId: 1, "trans.account": 1 });
