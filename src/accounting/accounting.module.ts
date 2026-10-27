import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Company, CompanySchema } from "../company/schemas/company.schema";
import { Invoice, InvoiceSchema } from "../invoices/schemas/invoice.schema";
import {
  SupplierInvoice,
  SupplierInvoiceSchema,
} from "../supplier-invoices/schemas/supplier-invoice.schema";
import { AccountingController } from "./accounting.controller";
import { AccountingService } from "./accounting.service";
import { LedgerService } from "./ledger.service";
import {
  LedgerVerification,
  LedgerVerificationSchema,
  LedgerYear,
  LedgerYearSchema,
} from "./schemas/ledger.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: SupplierInvoice.name, schema: SupplierInvoiceSchema },
      { name: Company.name, schema: CompanySchema },
      { name: LedgerYear.name, schema: LedgerYearSchema },
      { name: LedgerVerification.name, schema: LedgerVerificationSchema },
    ]),
  ],
  controllers: [AccountingController],
  providers: [AccountingService, LedgerService],
})
export class AccountingModule {}
