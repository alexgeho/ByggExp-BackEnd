import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { SupplierInvoicesController } from "./supplier-invoices.controller";
import { SupplierInvoicesService } from "./supplier-invoices.service";
import {
  SupplierInvoice,
  SupplierInvoiceSchema,
} from "./schemas/supplier-invoice.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SupplierInvoice.name, schema: SupplierInvoiceSchema },
    ]),
  ],
  controllers: [SupplierInvoicesController],
  providers: [SupplierInvoicesService],
  exports: [SupplierInvoicesService],
})
export class SupplierInvoicesModule {}
