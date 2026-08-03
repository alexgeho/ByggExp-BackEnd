import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { NotificationsModule } from "../notifications/notifications.module";
import { User, UserSchema } from "../users/schemas/user.schema";
import { Project, ProjectSchema } from "../projects/schemas/project.schema";
import { Task, TaskSchema } from "../tasks/schemas/task.schema";
import { Invoice, InvoiceSchema } from "../invoices/schemas/invoice.schema";
import {
  SupplierInvoice,
  SupplierInvoiceSchema,
} from "../supplier-invoices/schemas/supplier-invoice.schema";
import { Expense, ExpenseSchema } from "../expenses/schemas/expense.schema";
import { ManagerRemindersService } from "./manager-reminders.service";
import { ManagerRemindersController } from "./manager-reminders.controller";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Task.name, schema: TaskSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: SupplierInvoice.name, schema: SupplierInvoiceSchema },
      { name: Expense.name, schema: ExpenseSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [ManagerRemindersController],
  providers: [ManagerRemindersService],
})
export class ManagerRemindersModule {}
