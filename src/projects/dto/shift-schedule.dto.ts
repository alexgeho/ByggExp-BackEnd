import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ShiftScheduleDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  workDayStartTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  workDayEndTime?: string;

  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const parsedValue = Number(value);
    return Number.isNaN(parsedValue) ? value : parsedValue;
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  startGraceMinutes?: number;

  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const parsedValue = Number(value);
    return Number.isNaN(parsedValue) ? value : parsedValue;
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  endGraceMinutes?: number;

  @IsOptional()
  @IsString()
  timezone?: string;
}
