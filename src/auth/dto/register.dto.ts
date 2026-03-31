import { IsEmail, IsString, MinLength, IsEnum } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;

  @IsString()
  name: string;

  phoneAreaCode: number;
  phoneNumber: number;

  @IsEnum(['admin', 'manager', 'client', 'worker'], { message: 'Invalid role' })
  role: string = 'client'; // по умолчанию — client
}