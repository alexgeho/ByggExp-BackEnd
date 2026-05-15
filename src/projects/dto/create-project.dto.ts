import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  IsDateString,
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