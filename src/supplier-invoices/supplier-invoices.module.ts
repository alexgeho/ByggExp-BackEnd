import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { SupplierInvoicesController } from "./supplier-invoices.controller";
import { SupplierInvoicesService } from "./supplier-invoices.service";
import {
  SupplierInvoice,
  SupplierInvoiceSchema,
} from "./schemas/supplier-invoice.schema";
import { User, UserSchema } from "../users/schemas/user.schema";
import {
  MaterialOrder,
  MaterialOrderSchema,
} from "../material-orders/schemas/material-order.schema";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SupplierInvoice.name, schema: SupplierInvoiceSchema },
      { name: User.name, schema: UserSchema },
      { name: MaterialOrder.name, schema: MaterialOrderSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [SupplierInvoicesController],
  providers: [SupplierInvoicesService],
  exports: [SupplierInvoicesService],
})
export class SupplierInvoicesModule {}
