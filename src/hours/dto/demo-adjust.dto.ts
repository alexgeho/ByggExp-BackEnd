import {
  IsArray,
  IsNumber,
  IsOptional,
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
}
