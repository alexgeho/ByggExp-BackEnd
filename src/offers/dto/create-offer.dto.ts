import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OfferStatus } from '../schemas/offer.schema';

export class OfferContactPersonDto {
  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class CreateOfferDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsOptional()
  @IsString()
  priceText?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  clarifications?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfferContactPersonDto)
  contactPersons?: OfferContactPersonDto[];

  @IsOptional()
  @IsString()
  logoUrl?: string | null;

  @IsOptional()
  @IsArray()
  items?: unknown[];

  @IsOptional()
  @IsNumber()
  subtotal?: number;

  @IsOptional()
  @IsNumber()
  vat?: number;

  @IsOptional()
  @IsNumber()
  total?: number;

  @IsOptional()
  @IsIn(Object.values(OfferStatus))
  status?: OfferStatus;
}
