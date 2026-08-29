import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from "class-validator";

// TEMPORARY — demo/video helper to tweak measured GPS and worker Manual hours on
// existing shifts. Remove after recording. See HoursService.demoAdjust.
export class DemoAdjustDto {
  @IsOptional()
  @Matches(/^[a-f\d]{24}$/i, { message: "projectId must be a valid ObjectId" })
  projectId?: string;

  @IsOptional()
  @IsArray()
  @Matches(/^[a-f\d]{24}$/i, { each: true })
  workerIds?: string[];

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  // Multiply existing GPS (durationMs) by this factor (e.g. 0.5 = halve).
  @IsOptional()
  @IsNumber()
  @Min(0)
  gpsFactor?: number;

  // Set GPS (durationMs) to this many hours.
  @IsOptional()
  @IsNumber()
  @Min(0)
  gpsHours?: number;

  // Set Manual (manualDurationMs) to this many hours.
  @IsOptional()
  @IsNumber()
  @Min(0)
  manualHours?: number;

  // Set Manual (manualDurationMs) to this factor of the shift's GPS durationMs
  // (e.g. 0.85 = manual is 85% of GPS, so always a bit less than GPS).
  @IsOptional()
  @IsNumber()
  @Min(0)
  manualFactor?: number;

  // Round Manual (manualDurationMs) to whole hours (e.g. 7,32 h -> 7 h).
  @IsOptional()
  @IsBoolean()
  roundManualHours?: boolean;

  // Set GPS (durationMs) to this factor of the (rounded) Manual manualDurationMs
  // (e.g. 1.15 = GPS is manual + 15%, so always a bit above manual).
  @IsOptional()
  @IsNumber()
  @Min(0)
  gpsFromManualFactor?: number;

  // Mark the matched shifts as a full absence (no planned/GPS/manual in the grid).
  // true also zeroes GPS + Manual; false clears the flag.
  @IsOptional()
  @IsBoolean()
  absent?: boolean;

  // Rename the (single) matched worker's display name — demo/video helper only.
  @IsOptional()
  @IsString()
  rename?: string;

  // Clear all hours on weekend days (Sat/Sun) in the range: deletes weekend hour
  // adjustments and weekend shifts so those cells go empty. Demo/video helper.
  @IsOptional()
  @IsBoolean()
  clearWeekends?: boolean;
}
