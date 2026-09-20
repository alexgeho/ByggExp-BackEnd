import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  SupplierInvoice,
  SupplierInvoiceSchema,
} from "../supplier-invoices/schemas/supplier-invoice.schema";
import { User, UserSchema } from "../users/schemas/user.schema";
import { NotificationsModule } from "../notifications/notifications.module";
import { PaymentRemindersService } from "./payment-reminders.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SupplierInvoice.name, schema: SupplierInvoiceSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
  ],
  providers: [PaymentRemindersService],
})
export class PaymentRemindersModule {}
