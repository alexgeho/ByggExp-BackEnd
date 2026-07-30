import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class CreateAssignmentDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsDateString()
  date: string;

  @IsNumber()
  @Min(0)
  @Max(24)
  @IsOptional()
  hours?: number;

  @IsString()
  @IsOptional()
  note?: string;
}
