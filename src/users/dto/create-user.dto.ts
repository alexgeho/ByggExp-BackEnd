import {
  IsEmail,
  IsString,
  MinLength,
  IsEnum,
  IsOptional,
  IsArray,
  IsNumber,
  IsNotEmpty,
  IsObject,
  IsBoolean,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../schemas/user.schema';

export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ValidateIf((dto) => !dto.inviteViaEmail)
  @IsString()
  @MinLength(6)
  @IsNotEmpty()
  password?: string;

  @IsOptional()
  @IsBoolean()
  inviteViaEmail?: boolean;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  profession?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    return typeof value === 'string' ? parseInt(value.replace(/\D/g, ''), 10) : value;
  })
  @IsNumber()
  @IsOptional()
  phoneAreaCode?: number;

  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    return typeof value === 'string' ? parseInt(value.replace(/\D/g, ''), 10) : value;
  })
  @IsNumber()
  @IsOptional()
  phoneNumber?: number;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole = UserRole.Worker;

  @IsString()
  @IsOptional()
  companyId?: string | null;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  projectIds?: string[];

  @IsObject()
  @IsOptional()
  language?: Record<string, any>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  additionalDocuments?: string[];
}