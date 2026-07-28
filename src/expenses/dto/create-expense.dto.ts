import { IsIn, IsNumber, IsOptional, IsString } from "class-validator";
import { ExpensePaidBy, ExpenseStatus } from "../schemas/expense.schema";

export class CreateExpenseDto {
  @IsOptional()
  @IsString()
  projectId?: string | null;

  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsNumber()
  vat?: number;

  @IsOptional()
  @IsIn(Object.values(ExpensePaidBy))
  paidBy?: ExpensePaidBy;

  @IsOptional()
  @IsString()
  receiptUrl?: string | null;

  @IsOptional()
  @IsIn(Object.values(ExpenseStatus))
  status?: ExpenseStatus;
}
