import {
  MaxLength,
  IsString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from "class-validator";

// A worker records the hours they actually worked on a completed shift, as a
// duration in milliseconds. `null` clears the entry (Manual goes back to unlit);
// a number is capped at 24h so a typo can't bill an impossible day.
export class SetManualHoursDto {
  @ValidateIf((_object, value) => value !== null)
  @IsInt({ message: "durationMs must be an integer number of milliseconds" })
  @Min(0)
  @Max(24 * 60 * 60 * 1000, { message: "durationMs cannot exceed 24 hours" })
  @IsOptional()
  durationMs?: number | null;

  // The part of the hours that is övertid; see AddManualHoursDto.
  @IsInt({ message: "overtimeMs must be an integer number of milliseconds" })
  @Min(0)
  @Max(24 * 60 * 60 * 1000, { message: "overtimeMs cannot exceed 24 hours" })
  @IsOptional()
  overtimeMs?: number;

  // OB hours inside the day (part of durationMs, never overlapping övertid).
  // Left out, the day keeps the OB it had.
  @IsInt({ message: "obMs must be an integer number of milliseconds" })
  @Min(0)
  @Max(24 * 60 * 60 * 1000, { message: "obMs cannot exceed 24 hours" })
  @IsOptional()
  obMs?: number;

  // Restid, Bil and Traktamente from the day card — same fields as Dagens
  // rapport. Left out, the day keeps what it had.
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  @IsOptional()
  travelMinutes?: number;

  @IsNumber()
  @Min(0)
  @Max(2000)
  @IsOptional()
  travelKm?: number;

  @IsIn(["none", "half", "full"])
  @IsOptional()
  perDiem?: string;

  // The day's comment, written in the same card as the hours.
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  dayNote?: string;
}
