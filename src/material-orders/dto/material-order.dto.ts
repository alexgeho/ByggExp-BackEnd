import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export class MaterialOrderRowDto {
  @IsOptional()
  @IsString()
  articleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  articleNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class CreateMaterialOrderDto {
  @IsString()
  projectId: string;

  @IsString()
  @MaxLength(100)
  supplier: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => MaterialOrderRowDto)
  rows?: MaterialOrderRowDto[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  deliveryAddress?: string;

  // ISO date (YYYY-MM-DD) or empty to clear.
  @IsOptional()
  @IsString()
  desiredDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class UpdateMaterialOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplier?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => MaterialOrderRowDto)
  rows?: MaterialOrderRowDto[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  desiredDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class UpsertMaterialSupplierDto {
  @IsOptional()
  @ValidateIf((o) => !!o.orderEmail)
  @IsEmail()
  orderEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  customerNumber?: string;
}

export class DiscountRowDto {
  @IsString()
  @MaxLength(64)
  group: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  percent: number;
}

// Rabattbrev: replaces the company's discounts at this grossist.
export class SetSupplierDiscountsDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => DiscountRowDto)
  rows: DiscountRowDto[];
}
