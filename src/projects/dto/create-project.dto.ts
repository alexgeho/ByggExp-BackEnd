import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  IsDateString,
  ValidateIf,
} from 'class-validator';
import { Transform, Expose } from 'class-transformer';

export class CreateProjectDto {
  @Expose()
  @Transform(({ value, obj }) => {
    const result = value || obj?.clientCompanyId;
    return result;
  })
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @Expose()
  @IsOptional()
  @IsString()
  clientCompanyId?: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  ownerId: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  projectManagerId: string;

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

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  documents?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tasks?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  workers?: string[];

  @IsString()
  @IsOptional()
  description?: string;
}