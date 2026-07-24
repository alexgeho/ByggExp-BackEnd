import { IsString, IsEmail, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  orgNumber?: string;

  @IsString()
  @IsOptional()
  vatNumber?: string;

  @IsString()
  @IsOptional()
  vatStatus?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  companyAdmins?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  projects?: string[];
}