import { IsOptional, IsString } from "class-validator";

export class PauseShiftDto {
  // "outside_project_area" marks a geofence auto-pause (logged as
  // AutoPausedGeofenceExit / Gps); absent or anything else is a manual pause.
  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  source?: string;
}
