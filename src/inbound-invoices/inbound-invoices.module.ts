import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ScanningModule } from "../scanning/scanning.module";
import {
  SupplierInvoice,
  SupplierInvoiceSchema,
} from "../supplier-invoices/schemas/supplier-invoice.schema";
import { InboundInvoicesController } from "./inbound-invoices.controller";
import { InboundInvoicesService } from "./inbound-invoices.service";

@Module({
  imports: [
    ScanningModule,
    MongooseModule.forFeature([
      { name: SupplierInvoice.name, schema: SupplierInvoiceSchema },
    ]),
  ],
  controllers: [InboundInvoicesController],
  providers: [InboundInvoicesService],
})
export class InboundInvoicesModule {}
