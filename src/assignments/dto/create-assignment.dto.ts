import {
  Matches,
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

  @IsOptional()
  @IsString()
  projectId?: string;

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

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "startTime must be HH:mm" })
  startTime?: string;
}
