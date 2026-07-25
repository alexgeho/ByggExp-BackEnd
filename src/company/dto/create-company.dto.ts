import { IsString, IsEmail, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class CreateCompanyDto {
  // Only email is required — it becomes the login of the company's first admin.
  // Everything else is optional and can be filled in later by the company.
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  address?: string;

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