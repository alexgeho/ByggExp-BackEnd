import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Company, CompanyDocument } from "../company/schemas/company.schema";
import {
  Invoice,
  InvoiceDocument,
  InvoiceStatus,
} from "../invoices/schemas/invoice.schema";
import {
  SupplierInvoice,
  SupplierInvoiceDocument,
} from "../supplier-invoices/schemas/supplier-invoice.schema";
import { UserRole } from "../users/schemas/user.schema";
import {
  invoiceToVerification,
  supplierInvoiceToVerification,
} from "./sie.mapper";
import { buildSieContent, encodeCp437, SieVerification } from "./sie.util";

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
};

export type SieExportOptions = {
  from?: string;
  to?: string;
  includeInvoices?: boolean;
  includeSuppliers?: boolean;
};

// Invoices in these states are booked; drafts and cancelled ones are not.
const BOOKED_INVOICE_STATUSES = [
  InvoiceStatus.Sent,
  InvoiceStatus.Paid,
  InvoiceStatus.Overdue,
];

const inRange = (date: string, from?: string, to?: string) => {
  if (!date) return true;
  const d = date.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
};

@Injectable()
export class AccountingService {
  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(SupplierInvoice.name)
    private supplierModel: Model<SupplierInvoiceDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
  ) {}

  async buildSieExport(
    user: AuthUser,
    opts: SieExportOptions,
    todayYmd: string,
  ) {
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    const company = await this.companyModel.findById(user.companyId).lean();
    if (!company) {
      throw new NotFoundException("Company not found");
    }

    const includeInvoices = opts.includeInvoices !== false;
    const includeSuppliers = opts.includeSuppliers !== false;
    const verifications: SieVerification[] = [];

    if (includeInvoices) {
      const invoices = await this.invoiceModel
        .find({
          companyId: user.companyId,
          status: { $in: BOOKED_INVOICE_STATUSES },
        })
        .lean();
      for (const inv of invoices) {
        const date = inv.date || "";
        if (!inRange(date, opts.from, opts.to)) continue;
        verifications.push(
          invoiceToVerification(
            inv as Parameters<typeof invoiceToVerification>[0],
          ),
        );
      }
    }

    if (includeSuppliers) {
      const suppliers = await this.supplierModel
        .find({ companyId: user.companyId })
        .lean();
      let seq = 1;
      for (const si of suppliers) {
        if (!inRange(si.invoiceDate || "", opts.from, opts.to)) continue;
        verifications.push(
          supplierInvoiceToVerification(
            si as Parameters<typeof supplierInvoiceToVerification>[0],
            seq++,
          ),
        );
      }
    }

    const content = buildSieContent({
      companyName: company.name || "",
      orgNumber: company.orgNumber || "",
      generatedDate: todayYmd,
      verifications,
    });

    return {
      buffer: encodeCp437(content),
      count: verifications.length,
      filename: this.filename(opts),
    };
  }

  private filename(opts: SieExportOptions) {
    const span = [opts.from, opts.to].filter(Boolean).join("_");
    return span ? `byggexp_${span}.se` : "byggexp_export.se";
  }
}
