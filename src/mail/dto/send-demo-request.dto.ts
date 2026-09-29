import { Transform } from "class-transformer";
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class SendDemoRequestDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  ["f-name"]: string;

  @Transform(trimString)
  @IsEmail()
  @IsNotEmpty()
  ["f-email"]: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  ["f-phone"]: string;

  // Page the form was sent from (the site sends host + path).
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ["f-source"]?: string;

  // Optional free-text message from the contact form.
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  ["f-message"]?: string;
}
