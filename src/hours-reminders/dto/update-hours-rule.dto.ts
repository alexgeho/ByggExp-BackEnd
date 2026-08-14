import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
} from "class-validator";

// Company-wide shift-anchored "log your hours" rule settings (admin-editable).
export class UpdateHoursRuleDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  startDelayMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  intervalMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  maxReminders?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  escalateAfterReminders?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workingWeekdays?: number[];
}
