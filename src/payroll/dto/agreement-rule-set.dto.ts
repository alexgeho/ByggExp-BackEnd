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
}

export class PayrollSettingsDto {
  @IsObject()
  @IsOptional()
  salaryCodes?: Record<string, string>;

  @IsObject()
  @IsOptional()
  absenceCodes?: Record<string, string>;

  @IsBoolean()
  @IsOptional()
  onlyApprovedShifts?: boolean;
}

export class WageBasisQueryDto {
  @Matches(DATE)
  from: string;

  @Matches(DATE)
  to: string;
}
