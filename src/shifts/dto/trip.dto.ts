import { Transform } from "class-transformer";
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

// "12,5" from a Swedish keyboard → 12.5; anything else is left to the
// validators.
const decimal = ({ value }: { value: unknown }) =>
  typeof value === "string" && value.trim() !== ""
    ? Number(value.replace(",", ".").replace(/\s/g, ""))
    : value;

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

  @Transform(decimal)
  @IsNumber()
  @Min(0)
  @Max(2000)
  @IsOptional()
  km?: number;

  @Transform(decimal)
  @IsNumber()
  @Min(0)
  @Max(9_999_999)
  @IsOptional()
  odometerStart?: number | null;

  @Transform(decimal)
  @IsNumber()
  @Min(0)
  @Max(9_999_999)
  @IsOptional()
  odometerEnd?: number | null;
}
