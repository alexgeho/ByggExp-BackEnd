import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { WageCategory } from '../schemas/agreement-rule-set.schema';
import {
  EXPORT_FORMATS,
  PAYROLL_SYSTEMS,
} from '../schemas/payroll-settings.schema';
import type {
  ExportFormat,
  PayrollSystem,
} from '../schemas/payroll-settings.schema';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class MinimumWageDto {
  @IsEnum(WageCategory)
  category: WageCategory;

  @IsString()
  @IsOptional()
  label?: string;

  @IsNumber()
  @Min(0)
  hourly: number;
}

export class HourTypeSupplementDto {
  @IsString()
  hourType: string;

  @IsString()
  @IsOptional()
  label?: string;

  @IsIn(['percent', 'fixed'])
  kind: 'percent' | 'fixed';

  @IsNumber()
  @Min(0)
  value: number;
}

export class AgreementRuleSetDto {
  @IsString()
  @IsOptional()
  agreement?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @Matches(DATE)
  @IsOptional()
  validFrom?: string;

  @Matches(/^(\d{4}-\d{2}-\d{2})?$/)
  @IsOptional()
  validTo?: string;

  @IsString()
  @IsOptional()
  sourceNote?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MinimumWageDto)
  @IsOptional()
  minimumWages?: MinimumWageDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HourTypeSupplementDto)
  @IsOptional()
  hourTypeSupplements?: HourTypeSupplementDto[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  vacationPayPercent?: number | null;

  @IsNumber()
  @Min(0)
  @IsOptional()
  mileageRatePerKm?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  mileageTaxFreePerKm?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  travelTimeRatePerHour?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  perDiemFull?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  perDiemHalf?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  perDiemTaxFreeFull?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  perDiemTaxFreeHalf?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  atkPercent?: number | null;

  @IsIn(['percent', 'fixed'])
  @IsOptional()
  wageRaiseKind?: 'percent' | 'fixed' | null;

  @IsNumber()
  @Min(0)
  @IsOptional()
  wageRaiseValue?: number;
}

export class WageRateDto {
  @IsString()
  userId: string;

  @IsNumber()
  @Min(0)
  hourlyRate: number;

  @Matches(DATE)
  validFrom: string;
}

export class ApplyRaiseItemDto {
  @IsString()
  userId: string;

  @IsNumber()
  @Min(0)
  hourlyRate: number;
}

export class ApplyRaiseDto {
  @IsString()
  ruleSetId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApplyRaiseItemDto)
  items: ApplyRaiseItemDto[];
}

export class TaxTableImportDto {
  @IsNumber()
  year: number;

  @IsString()
  @IsOptional()
  url?: string;
}

export class RuleSourceDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  area?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class PayrollSettingsDto {
  @IsIn(PAYROLL_SYSTEMS)
  @IsOptional()
  payrollSystem?: PayrollSystem;

  @IsIn(EXPORT_FORMATS)
  @IsOptional()
  exportFormat?: ExportFormat;

  @IsObject()
  @IsOptional()
  salaryCodes?: Record<string, string>;

  @IsObject()
  @IsOptional()
  absenceCodes?: Record<string, string>;
}

export class WageBasisQueryDto {
  @Matches(DATE)
  from: string;

  @Matches(DATE)
  to: string;

  // Comma-separated user ids: only these workers (empty = everyone).
  @Matches(/^[a-f0-9]{24}(,[a-f0-9]{24})*$/)
  @IsOptional()
  userIds?: string;
}

export class WageExportQueryDto extends WageBasisQueryDto {
  // Overrides the company's saved format for this download.
  @IsIn(EXPORT_FORMATS)
  @IsOptional()
  format?: ExportFormat;
}
