import { IsIn, IsNumber, IsOptional, IsString } from "class-validator";

export class CreatePlanningEntryDto {
  @IsIn(["in", "out"])
  direction: "in" | "out";

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  ocr?: string;

  @IsOptional()
  @IsString()
  bankgiro?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
