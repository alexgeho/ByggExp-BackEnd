import { IsString, IsEmail, IsNotEmpty, IsOptional } from 'class-validator';

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

  @IsString()
  @IsOptional()
  adminPhoneAreaCode?: string = '+7';

  @IsString()
  @IsOptional()
  adminPhoneNumber?: string;
}
