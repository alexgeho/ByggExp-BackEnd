import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { OfferStatus } from "../schemas/offer.schema";

export class OfferContactPersonDto {
  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class OfferItemDto {
  @IsOptional()
  @IsString()
  articleNumber?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsNumber()
  discount?: number;

  @IsOptional()
  @IsNumber()
  vatRate?: number;

  // Text-only row (heading/note), same as on the invoice: no amount.
  @IsOptional()
  @IsBoolean()
  isText?: boolean;
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
  @IsIn(["company", "private"])
  clientType?: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  orgNumber?: string;

  @IsOptional()
  @IsString()
  phone?: string;

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
  @ValidateNested({ each: true })
  @Type(() => OfferItemDto)
  items?: OfferItemDto[];

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
