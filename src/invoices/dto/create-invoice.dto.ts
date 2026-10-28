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
import { InvoiceStatus } from "../schemas/invoice.schema";

export class InvoiceItemDto {
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

  @IsOptional()
  @IsBoolean()
  isText?: boolean;
}

export class InvoiceCompanyFooterDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  orgNumber?: string;

  @IsOptional()
  @IsString()
  vatNumber?: string;

  @IsOptional()
  @IsString()
  vatStatus?: string;
}

export class CreateInvoiceDto {
  // Purchase invoices billed on to the customer with this invoice.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supplierInvoiceIds?: string[];

  // Approved ÄTA billed with this invoice — marked "invoiced" only once the
  // invoice is saved.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ataIds?: string[];

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  projectId?: string | null;

  @IsOptional()
  @IsString()
  orderReference?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  customerNumber?: string;

  @IsOptional()
  @IsString()
  vatNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  representative?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  lateInterest?: string;

  @IsOptional()
  @IsString()
  ourReference?: string;

  @IsOptional()
  @IsString()
  yourReference?: string;

  @IsOptional()
  @IsString()
  reverseVAT?: string;

  // ROT-avdrag inputs; rotDeduction/rounding/roundedTotal are derived server-side.
  @IsOptional()
  @IsBoolean()
  rotEnabled?: boolean;

  @IsOptional()
  @IsIn(["rot", "rut", "green15", "green50"])
  deductionType?: string;

  @IsOptional()
  @IsString()
  rotPersonalNumber?: string;

  @IsOptional()
  @IsString()
  rotProperty?: string;

  @IsOptional()
  @IsNumber()
  rotLaborAmount?: number;

  @IsOptional()
  @IsString()
  logoUrl?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items?: InvoiceItemDto[];

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
  @IsIn(Object.values(InvoiceStatus))
  status?: InvoiceStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceCompanyFooterDto)
  companyFooter?: InvoiceCompanyFooterDto;
}
