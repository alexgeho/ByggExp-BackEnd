import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Company, CompanySchema } from "../company/schemas/company.schema";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { Invoice, InvoiceSchema } from "./schemas/invoice.schema";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Company.name, schema: CompanySchema },
    ]),
    MailModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
