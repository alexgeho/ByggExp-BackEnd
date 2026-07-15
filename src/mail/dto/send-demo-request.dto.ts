import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SendDemoRequestDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  ['f-name']: string;

  @Transform(trimString)
  @IsEmail()
  @IsNotEmpty()
  ['f-email']: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  ['f-phone']: string;
}
