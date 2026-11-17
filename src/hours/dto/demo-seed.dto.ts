import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

// TEMPORARY — demo data for the feature videos. Remove after recording.
export class DemoSeedEntryDto {
  @Matches(/^[a-f\d]{24}$/i, { message: "workerId must be a valid ObjectId" })
  workerId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "date must be YYYY-MM-DD" })
  date: string;

  // When the worker clocked in (ISO, with offset).
  @IsISO8601()
  startedAt: string;

  // Measured (GPS) hours.
  @IsNumber()
  @Min(0)
  @Max(24)
  gpsHours: number;

  // Hours the worker entered by hand; left out = nothing entered.
  @IsNumber()
  @Min(0)
  @Max(24)
  @IsOptional()
  manualHours?: number;
}

export class DemoSeedDto {
  @Matches(/^[a-f\d]{24}$/i, { message: "projectId must be a valid ObjectId" })
  projectId: string;

  // Every shift of the project inside this range is replaced by `entries`.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "from must be YYYY-MM-DD" })
  from: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "to must be YYYY-MM-DD" })
  to: string;

  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => DemoSeedEntryDto)
  entries: DemoSeedEntryDto[];
}
