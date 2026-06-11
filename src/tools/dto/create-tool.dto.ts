import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

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
      return value
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return value;
};

export class CreateToolDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  photoUrl?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @Transform(({ value }) => parseArrayField(value))
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  workerIds?: string[];

  @Transform(({ value }) => parseArrayField(value))
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  projectIds?: string[];

  @IsString()
  @IsOptional()
  companyId?: string;
}
