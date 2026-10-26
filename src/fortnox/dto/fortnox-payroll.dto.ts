import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class FortnoxPayrollDto {
  @Matches(DATE)
  from: string;

  @Matches(DATE)
  to: string;

  // Only these workers (empty = everyone in the lönerunderlag).
  @IsArray()
  @IsString({ each: true })
  @Matches(/^[a-f0-9]{24}$/, { each: true })
  @IsOptional()
  userIds?: string[];

  // Send again although the period was already sent.
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}
