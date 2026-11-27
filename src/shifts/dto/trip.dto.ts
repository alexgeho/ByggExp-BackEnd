import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

// One business trip in the körjournal. Odometer readings are optional — when
// both are given and km is 0, km is taken from them.
export class TripDto {
  @IsString()
  @MaxLength(200)
  @IsOptional()
  from?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  to?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  purpose?: string;

  @IsNumber()
  @Min(0)
  @Max(2000)
  @IsOptional()
  km?: number;

  @IsNumber()
  @Min(0)
  @Max(9_999_999)
  @IsOptional()
  odometerStart?: number | null;

  @IsNumber()
  @Min(0)
  @Max(9_999_999)
  @IsOptional()
  odometerEnd?: number | null;
}
