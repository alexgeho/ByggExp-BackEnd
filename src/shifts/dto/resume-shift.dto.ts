import { IsOptional, IsString } from "class-validator";

export class ResumeShiftDto {
  // "gps" marks a geofence auto-resume (logged as AutoResumedGeofenceReturn /
  // Gps); absent or anything else is a manual resume.
  @IsString()
  @IsOptional()
  source?: string;
}
