import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

export class TrackEventDto {
  @IsString()
  @MaxLength(120)
  event: string;

  @IsObject()
  @IsOptional()
  props?: Record<string, unknown>;

  @IsInt()
  @IsOptional()
  ts?: number;
}

export class TrackEventsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TrackEventDto)
  events: TrackEventDto[];
}
