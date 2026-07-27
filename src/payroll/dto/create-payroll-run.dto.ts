import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

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

  @IsIn(['planned', 'actual'])
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
