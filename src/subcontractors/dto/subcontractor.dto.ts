import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateSubcontractorDto {
  // Optional: only the e-mail is required (owner 18.11) — until the firm's
  // name is filled in, the contact person or the e-mail stands in for it.
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  orgNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  contactPerson?: string;

  // Required (owner 18.11): the contact person is invited to the admin at it.
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  workType?: string;
}

export class UpdateSubcontractorDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  orgNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  contactPerson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  workType?: string;
}
