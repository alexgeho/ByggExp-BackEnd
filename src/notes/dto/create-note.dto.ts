import { IsOptional, IsString } from "class-validator";

export class CreateNoteDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;
}
