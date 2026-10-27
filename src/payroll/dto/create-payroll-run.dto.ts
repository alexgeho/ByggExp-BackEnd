import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { MANUAL_ITEM_TYPES } from "../payroll-math";

export class PayrollLineInputDto {
  @IsString()
  userId: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  hours: number;

  // Optional client-provided rate; the server prefers the worker's stored
  // hourlyRate and only falls back to this.
  @IsNumber()
  @IsOptional()
  rate?: number;

  // OB-tillägg / overtime multiplier (1 = normal).
  @IsNumber()
  @IsOptional()
  multiplier?: number;

  @IsString()
  @IsOptional()
  hourType?: string;
}

export class CreatePayrollRunDto {
  @IsString()
  periodFrom: string;

  @IsString()
  periodTo: string;

  @IsIn(["planned", "actual"])
  @IsOptional()
  basis?: string;

  @IsString()
  @IsOptional()
  projectId?: string;

  // Preliminär skatt % applied to gross (simplified). Defaults to 30.
  @IsNumber()
  @IsOptional()
  taxRate?: number;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PayrollLineInputDto)
  lines: PayrollLineInputDto[];
}

// ---- Manual run (no shifts module) ----------------------------------------

export class ManualPayrollItemDto {
  @IsIn(MANUAL_ITEM_TYPES)
  type: string;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  label?: string;

  // normal / overtime / ob: hours × rate (rate defaults to the worker's timlön).
  @IsNumber()
  @Min(0)
  @Max(744)
  @IsOptional()
  hours?: number;

  @IsNumber()
  @Min(0)
  @Max(100000)
  @IsOptional()
  rate?: number;

  // monthly / other: fixed amount (other may be negative = löneavdrag).
  @IsNumber()
  @Min(-10000000)
  @Max(10000000)
  @IsOptional()
  amount?: number;
}

export class ManualPayrollEmployeeDto {
  @IsString()
  userId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualPayrollItemDto)
  items: ManualPayrollItemDto[];
}

export class ManualPayrollRunDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  periodFrom: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  periodTo: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  taxRate?: number;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ManualPayrollEmployeeDto)
  employees: ManualPayrollEmployeeDto[];
}
