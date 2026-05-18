import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  IsDateString,
  IsNumber,
} from 'class-validator';
import { Transform, Expose } from 'class-transformer';

const parseArrayField = (value: unknown) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [value];
    }
  }

  return value;
};

const parseOptionalNumberField = (value: unknown) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsedValue = Number(value);
  return Number.isNaN(parsedValue) ? value : parsedValue;
};

export class CreateProjectDto {
  @Expose()
  @Transform(({ value, obj }) => {
    const result = value || obj?.clientCompanyId;
    return result;
  })
  @IsOptional()
  @IsString()
  companyId?: string;

  @Expose()
  @IsOptional()
  @IsString()
  clientCompanyId?: string;

  @Expose()
  @IsOptional()
  @IsString()
  ownerId?: string;

  @Expose()
  @IsOptional()
  @IsString()
  projectManagerId?: string;

  @Transform(({ value }) => parseArrayField(value))
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  projectAdmins?: string[];

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(['planning', 'in_progress', 'completed', 'on_hold'])
  @IsOptional()
  status?: string = 'planning';

  @IsString()
  @IsOptional()
  location?: string;

  @Transform(({ value }) => parseOptionalNumberField(value))
  @IsNumber()
  @IsOptional()
  locationLatitude?: number;

  @Transform(({ value }) => parseOptionalNumberField(value))
  @IsNumber()
  @IsOptional()
  locationLongitude?: number;

  @IsString()
  @IsOptional()
  contractNumber?: string;

  @IsDateString()
  @IsOptional()
  beginningDate?: Date;

  @IsDateString()
  @IsOptional()
  endDate?: Date;

  @Transform(({ value }) => parseArrayField(value))
  @IsArray()
  @IsOptional()
  documents?: Array<string | { name: string; url: string; mimeType?: string }>;

  @Transform(({ value }) => parseArrayField(value))
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tasks?: string[];

  @Transform(({ value }) => parseArrayField(value))
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  workers?: string[];

  @IsString()
  @IsOptional()
  description?: string;
}