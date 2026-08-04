import { IsInt, IsOptional, Max, Min, ValidateIf } from "class-validator";

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
}
