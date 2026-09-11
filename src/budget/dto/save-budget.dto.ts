import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class BudgetMonthDto {
  @IsOptional()
  @IsNumber()
  income?: number;

  @IsOptional()
  @IsNumber()
  expense?: number;
}

export class SaveBudgetDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => BudgetMonthDto)
  months: BudgetMonthDto[];
}
