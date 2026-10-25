import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ScanningModule } from "../scanning/scanning.module";
import { ExpensesController } from "./expenses.controller";
import { ExpensesService } from "./expenses.service";
import { Expense, ExpenseSchema } from "./schemas/expense.schema";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Expense.name, schema: ExpenseSchema }]),
    ScanningModule,
  ],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
