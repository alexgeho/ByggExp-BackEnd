import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { PaymentPlanRowStatus } from "../schemas/payment-plan.schema";

export class PaymentPlanRowDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsNumber()
  percent?: number;

  @IsOptional()
  @IsString()
  plannedDate?: string;

  @IsOptional()
  @IsIn(Object.values(PaymentPlanRowStatus))
  status?: PaymentPlanRowStatus;

  @IsOptional()
  @IsNumber()
  invoiceNumber?: number | null;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreatePaymentPlanDto {
  @IsString()
  projectId: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  contractAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentPlanRowDto)
  rows?: PaymentPlanRowDto[];
}

export class UpdatePaymentPlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  contractAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentPlanRowDto)
  rows?: PaymentPlanRowDto[];
}

export class SetRowStatusDto {
  @IsIn(Object.values(PaymentPlanRowStatus))
  status: PaymentPlanRowStatus;

  @IsOptional()
  @IsNumber()
  invoiceNumber?: number | null;
}
