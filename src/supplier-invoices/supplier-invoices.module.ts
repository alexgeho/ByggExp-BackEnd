import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { SupplierInvoicesController } from "./supplier-invoices.controller";
import { SupplierInvoicesService } from "./supplier-invoices.service";
import {
  SupplierInvoice,
  SupplierInvoiceSchema,
} from "./schemas/supplier-invoice.schema";
import { User, UserSchema } from "../users/schemas/user.schema";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SupplierInvoice.name, schema: SupplierInvoiceSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [SupplierInvoicesController],
  providers: [SupplierInvoicesService],
  exports: [SupplierInvoicesService],
})
export class SupplierInvoicesModule {}
