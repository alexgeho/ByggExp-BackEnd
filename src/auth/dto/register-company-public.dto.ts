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

  @IsString()
  @MinLength(6)
  password: string;
}
