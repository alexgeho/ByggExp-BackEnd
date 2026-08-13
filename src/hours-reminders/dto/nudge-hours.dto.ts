import { IsArray, IsBoolean, IsOptional, IsString } from "class-validator";

// Admin-triggered "log your hours" nudge. Either target explicit workers
// (userIds) or a whole project (projectId); with onlyMissing the backend
// filters to workers who have not reported hours for today.
export class NudgeHoursDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsBoolean()
  onlyMissing?: boolean;
}
