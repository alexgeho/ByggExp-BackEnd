import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { promises as fs } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
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

// Fair-use limits for the e-mail intake (every scan is a paid AI call). Above
// them nothing is dropped: files are still saved as drafts, just without the
// automatic reading, with a note asking the company to contact us.
export const INBOUND_EMAILS_PER_DAY = 20;
export const INBOUND_FILES_PER_EMAIL = 20;
const LIMIT_NOTE =
  "Gränsen för automatisk tolkning av e-postade fakturor är nådd " +
  `(${INBOUND_EMAILS_PER_DAY} e-post per dygn, ${INBOUND_FILES_PER_EMAIL} bilagor per e-post). ` +
  "Fyll i uppgifterna manuellt, eller kontakta ByggExp om ni behöver mer.";

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
    const supported = (files || []).filter(
      (file) => file && isSupported(file.mimetype),
    );

    if (!supported.length) {
      return { created: 0, skipped: (files || []).length, invoices: [] };
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const created: SupplierInvoiceDocument[] = [];

    // E-mails received for this company in the last 24 hours (one batch each).
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentEmails = (
      await this.model.distinct("inboundBatch", {
        companyId,
        source: "email",
        inboundBatch: { $ne: null },
        createdAt: { $gte: since },
      })
    ).length;
    const overDailyLimit = recentEmails >= INBOUND_EMAILS_PER_DAY;
    if (overDailyLimit) {
      this.logger.warn(
        `Company ${companyId} is over ${INBOUND_EMAILS_PER_DAY} inbound e-mails/day; saving without scanning`,
      );
    }
    const inboundBatch = randomUUID();

    for (const [index, file] of supported.entries()) {
      try {
        const withinLimits = !overDailyLimit && index < INBOUND_FILES_PER_EMAIL;
        const scanned = !withinLimits
          ? null
          : await this.scanning
              .extract(file.buffer, file.mimetype)
              .catch((error) => {
                this.logger.warn(
                  `OCR failed for inbound invoice, creating blank draft: ${
                    (error as Error)?.message || error
                  }`,
                );
                return null;
              });

        const safeName = (file.originalname || "invoice").replace(
          /[^\w.\-]+/g,
          "_",
        );
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
          ocr: scanned?.ocr || "",
          bankgiro: scanned?.bankgiro || "",
          plusgiro: scanned?.plusgiro || "",
          amountExclVat: Number(scanned?.amountExclVat) || 0,
          vat: Number(scanned?.vat) || 0,
          total: Number(scanned?.total) || 0,
          notes: scanned
            ? ""
            : withinLimits
              ? "Kunde inte läsa fakturan automatiskt – kontrollera manuellt."
              : LIMIT_NOTE,
          attachmentUrl,
          status: SupplierInvoiceStatus.Registered,
          source: "email",
          inboundBatch,
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
