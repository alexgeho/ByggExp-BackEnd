import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Company, CompanySchema } from "../company/schemas/company.schema";
import { Client, ClientSchema } from "../clients/schemas/client.schema";
import { Invoice, InvoiceSchema } from "../invoices/schemas/invoice.schema";
import { InvoicesModule } from "../invoices/invoices.module";
import { PayrollModule } from "../payroll/payroll.module";
import {
  PayrollExport,
  PayrollExportSchema,
} from "../payroll/schemas/payroll-export.schema";
import {
  SupplierInvoice,
  SupplierInvoiceSchema,
} from "../supplier-invoices/schemas/supplier-invoice.schema";
import { Project, ProjectSchema } from "../projects/schemas/project.schema";
import { FortnoxController } from "./fortnox.controller";
import { FortnoxService } from "./fortnox.service";
import {
  FortnoxConnection,
  FortnoxConnectionSchema,
} from "./schemas/fortnox-connection.schema";

@Module({
  imports: [
    InvoicesModule,
    PayrollModule,
    MongooseModule.forFeature([
      { name: FortnoxConnection.name, schema: FortnoxConnectionSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Client.name, schema: ClientSchema },
      { name: Company.name, schema: CompanySchema },
      { name: PayrollExport.name, schema: PayrollExportSchema },
      { name: SupplierInvoice.name, schema: SupplierInvoiceSchema },
      { name: Project.name, schema: ProjectSchema },
    ]),
  ],
  controllers: [FortnoxController],
  providers: [FortnoxService],
})
export class FortnoxModule {}
