import { Type } from "class-transformer";
import { TripDto } from "./trip.dto";
import { MAX_TRIPS_PER_DAY } from "../korjournal";
import {
  ArrayMaxSize,
  IsArray,
  ValidateNested,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

// What a worker adds to a day once the pass is done: which pay bucket the hours
// belong to, the travel they are owed for, and a line of diary.
export class DayReportDto {
  @IsIn(["normal", "overtime", "ob"])
  @IsOptional()
  hourType?: string;

  // Kilometres driven. Capped so a slipped digit can't claim a trip across
  // Europe.
  @IsNumber()
  @Min(0)
  @Max(2000)
  @IsOptional()
  travelKm?: number;

  // Körjournal trips; when sent and not empty, travelKm becomes their sum.
  @IsArray()
  @ArrayMaxSize(MAX_TRIPS_PER_DAY)
  @ValidateNested({ each: true })
  @Type(() => TripDto)
  @IsOptional()
  trips?: TripDto[];

  @IsInt()
  @Min(0)
  @Max(24 * 60)
  @IsOptional()
  travelMinutes?: number;

  @IsIn(["none", "half", "full"])
  @IsOptional()
  perDiem?: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  dayNote?: string;

  // null unlinks the day from its ÄTA.
  @IsString()
  @IsOptional()
  ataId?: string | null;
}
