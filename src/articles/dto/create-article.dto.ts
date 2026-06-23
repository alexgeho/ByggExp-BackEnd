import { IsNumber, IsOptional, IsString } from 'class-validator';

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
}
