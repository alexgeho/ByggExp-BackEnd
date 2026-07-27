import { IsIn, IsNumber, IsOptional, IsString } from "class-validator";
import { SupplierInvoiceStatus } from "../schemas/supplier-invoice.schema";

export class CreateSupplierInvoiceDto {
  @IsOptional()
  @IsString()
  projectId?: string | null;

  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsOptional()
  @IsString()
  supplierOrgNumber?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  invoiceDate?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  amountExclVat?: number;

  @IsOptional()
  @IsNumber()
  vat?: number;

  @IsOptional()
  @IsNumber()
  total?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string | null;

  @IsOptional()
  @IsIn(Object.values(SupplierInvoiceStatus))
  status?: SupplierInvoiceStatus;
}
