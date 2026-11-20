import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ScanningModule } from "../scanning/scanning.module";
import {
  SupplierInvoice,
  SupplierInvoiceSchema,
} from "../supplier-invoices/schemas/supplier-invoice.schema";
import { Company, CompanySchema } from "../company/schemas/company.schema";
import { InboundInvoicesController } from "./inbound-invoices.controller";
import { InboundInvoicesService } from "./inbound-invoices.service";
import { InboundMailboxService } from "./inbound-mailbox.service";

@Module({
  imports: [
    ScanningModule,
    MongooseModule.forFeature([
      { name: SupplierInvoice.name, schema: SupplierInvoiceSchema },
      { name: Company.name, schema: CompanySchema },
    ]),
  ],
  controllers: [InboundInvoicesController],
  providers: [InboundInvoicesService, InboundMailboxService],
})
export class InboundInvoicesModule {}
