import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type BudgetDocument = HydratedDocument<Budget>;

// Planned income/expense for one calendar month (12 per year). Actuals are
// computed on the fly from real invoices/expenses and are NOT stored here.
@Schema({ _id: false })
export class BudgetMonth {
  @Prop({ type: Number, default: 0 })
  income: number;

  @Prop({ type: Number, default: 0 })
  expense: number;
}
const BudgetMonthSchema = SchemaFactory.createForClass(BudgetMonth);

// One company's manual budget plan for a given year.
@Schema({ timestamps: true })
export class Budget {
  @Prop({ type: String, ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ type: Number, required: true, index: true })
  year: number;

  // Always length 12 (Jan..Dec).
  @Prop({ type: [BudgetMonthSchema], default: () => [] })
  months: BudgetMonth[];
}

export const BudgetSchema = SchemaFactory.createForClass(Budget);
BudgetSchema.index({ companyId: 1, year: 1 }, { unique: true });
