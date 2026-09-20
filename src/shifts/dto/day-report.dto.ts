import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

// What a worker adds to a day once the pass is done: which pay bucket the hours
// belong to, the travel they are owed for, and a line of diary.
export class DayReportDto {
  @IsIn(["normal", "overtime", "ob"])
  @IsOptional()
  hourType?: string;

  // Kilometres driven. Capped so a slipped digit can't claim a trip across
  // Europe.
  @IsNumber()
  @Min(0)
  @Max(2000)
  @IsOptional()
  travelKm?: number;

  @IsInt()
  @Min(0)
  @Max(24 * 60)
  @IsOptional()
  travelMinutes?: number;

  @IsIn(["none", "half", "full"])
  @IsOptional()
  perDiem?: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  dayNote?: string;

  // null unlinks the day from its ÄTA.
  @IsString()
  @IsOptional()
  ataId?: string | null;
}
