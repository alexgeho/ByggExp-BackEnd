import { Type } from "class-transformer";
import {
  PRICE_LIST_FILE_TYPES,
  type PriceListFileType,
} from "../price-list-merge";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class ImportArticleRowDto {
  @IsString()
  articleNumber: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsNumber()
  purchasePrice: number;
}

// One chunk of a grossist price list. The client sends big files in chunks.
export class ImportArticlesDto {
  @IsString()
  supplier: string;

  // Påslag on the net purchase price → sales price (priceExclMoms).
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  markupPercent?: number;

  // Huvudprislista / Nettoprislista / Kopparpriser. Default: main.
  @IsOptional()
  @IsIn(PRICE_LIST_FILE_TYPES)
  fileType?: PriceListFileType;

  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ImportArticleRowDto)
  rows: ImportArticleRowDto[];
}
