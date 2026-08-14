import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
} from "class-validator";

export class RegisterCompanyWithAdminDto {
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
  @IsNotEmpty()
  adminName: string;

  @IsEmail()
  @IsNotEmpty()
  adminEmail: string;

  @IsString()
  @IsNotEmpty()
  adminPassword: string;

  // When true, adminPassword is already a bcrypt hash (from a verified pending
  // registration) and must not be hashed again.
  @IsOptional()
  @IsBoolean()
  adminPasswordIsHashed?: boolean;

  @IsString()
  @IsOptional()
  adminPhoneAreaCode?: string = "+7";

  @IsString()
  @IsOptional()
  adminPhoneNumber?: string;
}
