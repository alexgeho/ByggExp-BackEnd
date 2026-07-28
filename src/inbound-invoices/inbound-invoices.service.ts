import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { promises as fs } from "fs";
import { join } from "path";
import { ScanningService } from "../scanning/scanning.service";
import {
  SupplierInvoice,
  SupplierInvoiceDocument,
  SupplierInvoiceStatus,
} from "../supplier-invoices/schemas/supplier-invoice.schema";

interface InboundFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

// Same folder the manual attachment upload writes to, so e-mailed and
// hand-uploaded invoice files live together and are served the same way.
const UPLOAD_DIR = "./uploads/supplier-invoices";

const isSupported = (mimetype = "") =>
  mimetype === "application/pdf" || mimetype.startsWith("image/");

@Injectable()
export class InboundInvoicesService {
  private readonly logger = new Logger(InboundInvoicesService.name);

  constructor(
    @InjectModel(SupplierInvoice.name)
    private readonly model: Model<SupplierInvoiceDocument>,
    private readonly scanning: ScanningService,
  ) {}

  // Turns the PDF/image attachments of a forwarded invoice e-mail into draft
  // supplier invoices. Each file is OCR'd (best-effort — a failed read still
  // creates a draft so nothing is silently dropped) and stored for review.
  async ingest(companyId: string, files: InboundFile[]) {
    const supported = (files || []).filter((file) => file && isSupported(file.mimetype));

    if (!supported.length) {
      return { created: 0, skipped: (files || []).length, invoices: [] };
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const created: SupplierInvoiceDocument[] = [];

    for (const file of supported) {
      try {
        const scanned = await this.scanning
          .extract(file.buffer, file.mimetype)
          .catch((error) => {
            this.logger.warn(
              `OCR failed for inbound invoice, creating blank draft: ${
                (error as Error)?.message || error
              }`,
            );
            return null;
          });

        const safeName = (file.originalname || "invoice").replace(/[^\w.\-]+/g, "_");
        const filename = `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}`;
        await fs.writeFile(join(UPLOAD_DIR, filename), file.buffer);
        const attachmentUrl = `/uploads/supplier-invoices/${filename}`;

        const doc = await new this.model({
          companyId,
          projectId: null,
          supplierName: scanned?.supplierName || "",
          supplierOrgNumber: scanned?.supplierOrgNumber || "",
          invoiceNumber: scanned?.invoiceNumber || "",
          invoiceDate: scanned?.date || "",
          dueDate: scanned?.dueDate || "",
          category: scanned?.category || "",
          amountExclVat: Number(scanned?.amountExclVat) || 0,
          vat: Number(scanned?.vat) || 0,
          total: Number(scanned?.total) || 0,
          notes: scanned ? "" : "Kunde inte läsa fakturan automatiskt – kontrollera manuellt.",
          attachmentUrl,
          status: SupplierInvoiceStatus.Registered,
          source: "email",
        }).save();

        created.push(doc);
      } catch (error) {
        this.logger.error(
          `Failed to ingest inbound invoice file: ${(error as Error)?.message || error}`,
        );
      }
    }

    return {
      created: created.length,
      skipped: (files || []).length - supported.length,
      invoices: created.map((doc) => ({
        id: doc._id,
        supplierName: doc.supplierName,
        total: doc.total,
        dueDate: doc.dueDate,
      })),
    };
  }
}
