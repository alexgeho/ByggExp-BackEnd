import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
} from 'class-validator';
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

export class UpdateTaskDto {
  @IsString()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  taskTitle?: string;

  @IsString()
  @IsOptional()
  taskDescription?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @Transform(({ value }) => parseArrayField(value))
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  notifications?: string[];

  @Transform(({ value }) => parseArrayField(value))
  @IsArray()
  @IsOptional()
  documents?: Array<string | { name: string; url: string; mimeType?: string }>;

  @IsDateString()
  @IsOptional()
  startDate?: Date;

  @IsDateString()
  @IsOptional()
  dueDate?: Date;
}
