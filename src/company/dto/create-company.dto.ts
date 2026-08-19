import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsArray,
} from "class-validator";

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

  // ISO country code of the company's home market (e.g. "SE", "NO").
  @IsString()
  @IsOptional()
  country?: string;

  // ISO 4217 currency the company invoices in (e.g. "SEK", "NOK").
  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  companyAdmins?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  projects?: string[];
}
