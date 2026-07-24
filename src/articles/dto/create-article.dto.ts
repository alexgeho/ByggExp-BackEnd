import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { HouseworkType } from '../schemas/article.schema';

export class CreateArticleDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  articleNumber?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  kontering?: string;

  @IsOptional()
  @IsNumber()
  momsPercent?: number;

  @IsOptional()
  @IsNumber()
  priceExclMoms?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  nameEnglish?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  purchasePriceExclMoms?: number;

  @IsOptional()
  @IsEnum(HouseworkType)
  houseworkType?: HouseworkType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  articleGroups?: string[];
}
