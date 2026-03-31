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

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  companyAdmins?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  projects?: string[];
}