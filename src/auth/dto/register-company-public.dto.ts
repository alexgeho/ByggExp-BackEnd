import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

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

  // The user chooses their own password at sign-up. We only ever store its
  // bcrypt hash — the plaintext is never persisted or logged.
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
