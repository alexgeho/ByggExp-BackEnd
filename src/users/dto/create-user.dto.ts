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
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../schemas/user.schema';

export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(6)
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  profession?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? parseInt(value.replace(/\D/g, ''), 10) : value
  )
  @IsNumber()
  @IsNotEmpty()
  phoneAreaCode: number;

  @Transform(({ value }) =>
    typeof value === 'string' ? parseInt(value.replace(/\D/g, ''), 10) : value
  )
  @IsNumber()
  @IsNotEmpty()
  phoneNumber: number;

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