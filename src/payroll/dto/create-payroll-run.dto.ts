import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsISO8601,
  IsMongoId,
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

  // The hours grid's measure (planned / GPS / manual hours).
  @IsIn(["planned", "actual", "manual"])
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
  @IsMongoId()
  userId: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ManualPayrollItemDto)
  items: ManualPayrollItemDto[];
}

export class ManualPayrollRunDto {
  // Strict calendar dates (2026-02-30 fails), same month (checked in service).
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  periodFrom: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  periodTo: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  taxRate?: number;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ManualPayrollEmployeeDto)
  employees: ManualPayrollEmployeeDto[];
}
