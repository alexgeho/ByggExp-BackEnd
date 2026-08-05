import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class RegisterCompanyPublicDto {
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @IsString()
  @IsNotEmpty()
  userName: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  // Optional: the mobile app registers without a password (session is issued
  // immediately via returned tokens). When omitted, the server generates a
  // secure random password so the account still has a valid credential.
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
