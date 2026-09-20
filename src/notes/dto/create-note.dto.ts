import { IsDateString, IsOptional, IsString } from "class-validator";

export class CreateNoteDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  // ISO timestamp, or null to clear the bell.
  @IsOptional()
  @IsDateString()
  remindAt?: string | null;
}
