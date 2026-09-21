import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { Response } from "express";
import * as fs from "fs";
import * as path from "path";
import archiver from "archiver";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import { NotificationsService } from "../notifications/notifications.service";
import { CreateSupplierInvoiceDto } from "./dto/create-supplier-invoice.dto";
import {
  SupplierInvoice,
  SupplierInvoiceDocument,
  SupplierInvoiceStatus,
} from "./schemas/supplier-invoice.schema";

const DAY_MS = 86400000;
const addDays = (iso: string, days: number): string => {
  const d = new Date(iso);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
};

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
};

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

@Injectable()
export class SupplierInvoicesService {
  private readonly logger = new Logger(SupplierInvoicesService.name);

  constructor(
    @InjectModel(SupplierInvoice.name)
    private model: Model<SupplierInvoiceDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private readonly notifications: NotificationsService,
  ) {}

  // Daily heads-up so a supplier bill never slips into inkasso: push the company
  // admins when an unpaid invoice is due today or in exactly `lead` days. Two
  // stateless touch-points (lead + due day) — no per-invoice flag, no spam.
  // Fully inert unless PAYMENT_REMINDERS_ENABLED=true (and only sends where the
  // admins have a mobile push token).
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async remindUpcomingPayments(): Promise<void> {
    if (process.env.PAYMENT_REMINDERS_ENABLED !== "true") return;
    const lead = Math.max(
      0,
      Number(process.env.PAYMENT_REMINDER_LEAD_DAYS ?? 3) || 0,
    );
    const today = new Date().toISOString().slice(0, 10);
    const leadDay = addDays(today, lead);

    const due = await this.model
      .find({
        status: { $ne: SupplierInvoiceStatus.Paid },
        dueDate: { $in: [today, leadDay] },
        // A credit note carries the original's due date and a negative total.
        // It is money coming back, not a bill to pay — reminding about it would
        // tell the admin to pay minus twenty-five thousand.
        $or: [{ creditOfId: null }, { creditOfId: { $exists: false } }],
      })
      .lean()
      .exec();
    if (!due.length) return;

    // Group by company so each admin gets one summary.
    const byCompany = new Map<string, typeof due>();
    for (const inv of due) {
      const key = String(inv.companyId);
      if (!byCompany.has(key)) byCompany.set(key, []);
      byCompany.get(key)!.push(inv);
    }

    for (const [companyId, invoices] of byCompany) {
      const admins = await this.userModel
        .find({ companyId, role: UserRole.CompanyAdmin })
        .select("_id")
        .lean()
        .exec();
      if (!admins.length) continue;

      const total = invoices.reduce((s, i) => s + (Number(i.total) || 0), 0);
      const n = invoices.length;
      try {
        await this.notifications.sendToUsers(
          admins.map((a) => String(a._id)),
          {
            title: "Betalning förfaller",
            body:
              n === 1
                ? `Leverantörsfaktura till ${invoices[0].supplierName || "leverantör"} förfaller (${Math.round(total)} kr).`
                : `${n} leverantörsfakturor förfaller snart (${Math.round(total)} kr).`,
            // With one bill the tap should land on that bill, like the
            // per-invoice reminder does — not on the bare list.
            data: {
              type: "payment_due",
              screen: "SupplierInvoices",
              ...(n === 1 ? { entityId: String(invoices[0]._id) } : {}),
            },
          },
        );
      } catch (error) {
        this.logger.warn(
          `Payment reminder push failed for company ${companyId}: ${(error as Error)?.message}`,
        );
      }
    }
  }

  private resolveCompanyId(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return user.companyId;
  }

  private computeTotal(dto: CreateSupplierInvoiceDto): number {
    if (dto.total !== undefined && dto.total !== null) {
      return round2(dto.total);
    }
    return round2((Number(dto.amountExclVat) || 0) + (Number(dto.vat) || 0));
  }

  async create(dto: CreateSupplierInvoiceDto, user: AuthUser) {
    const companyId = this.resolveCompanyId(user);
    const doc = new this.model({
      ...dto,
      companyId,
      projectId: dto.projectId || null,
      amountExclVat: round2(dto.amountExclVat ?? 0),
      vat: round2(dto.vat ?? 0),
      total: this.computeTotal(dto),
      status: dto.status || SupplierInvoiceStatus.Registered,
      createdByUserId: user.userId || null,
    });
    return doc.save();
  }

  // Credit a bill we have received: a negated copy that settles it, in full or
  // — when an amount is given — in part. A returned half of a 50 000 delivery
  // becomes a -25 000 entry against the original, which is how the accountant
  // expects to see it; deleting the bill is not an option once it is booked.
  async credit(
    id: string,
    user: AuthUser,
    amountExclVat?: number,
  ): Promise<SupplierInvoiceDocument> {
    const source = await this.findOne(id, user);

    if (source.creditOfId) {
      throw new BadRequestException(
        "A credit note cannot itself be credited",
      );
    }

    const sourceExcl = Number(source.amountExclVat) || 0;
    const sourceVat = Number(source.vat) || 0;
    const partial =
      typeof amountExclVat === "number" && Number.isFinite(amountExclVat)
        ? Math.min(Math.abs(amountExclVat), Math.abs(sourceExcl))
        : null;

    // A partial credit keeps the original VAT rate rather than a flat share, so
    // the reversed VAT matches what was booked.
    const excl = partial === null ? sourceExcl : partial;
    const vatShare =
      sourceExcl !== 0 ? (sourceVat / sourceExcl) * excl : sourceVat;

    const credit = new this.model({
      companyId: source.companyId,
      projectId: source.projectId || null,
      supplierName: source.supplierName,
      supplierOrgNumber: source.supplierOrgNumber,
      invoiceNumber: source.invoiceNumber
        ? `${source.invoiceNumber}-K`
        : "",
      invoiceDate: new Date().toISOString().slice(0, 10),
      dueDate: source.dueDate,
      category: source.category,
      ocr: source.ocr,
      bankgiro: source.bankgiro,
      plusgiro: source.plusgiro,
      iban: source.iban,
      bic: source.bic,
      currency: source.currency,
      amountExclVat: round2(-excl),
      vat: round2(-vatShare),
      total: round2(-(excl + vatShare)),
      notes: source.notes,
      source: "manual",
      creditOfId: String(source._id),
      creditOfNumber: source.invoiceNumber || "",
      status: SupplierInvoiceStatus.Registered,
      createdByUserId: user.userId || null,
    });

    return credit.save();
  }

  async findAll(user: AuthUser, projectId?: string) {
    if (!user.companyId) {
      return [];
    }
    const filter: Record<string, unknown> = { companyId: user.companyId };
    if (projectId) {
      filter.projectId = projectId;
    }
    return this.model.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string, user: AuthUser) {
    const doc = await this.model.findById(id).exec();
    if (!doc) {
      throw new NotFoundException(`Supplier invoice "${id}" not found`);
    }
    this.assertCanAccess(doc, user);
    return doc;
  }

  // Stream a zip of the attached original documents for the selected invoices.
  // Only invoices the user may access and that actually have a file on disk are
  // included; the response is a downloadable purchase-invoices.zip.
  async streamAttachmentsZip(
    ids: string[],
    user: AuthUser,
    res: Response,
  ): Promise<void> {
    const unique = Array.from(new Set((ids || []).map(String))).filter(Boolean);
    if (!unique.length) {
      throw new BadRequestException("No invoices selected");
    }

    const uploadsRoot = path.join(process.cwd(), "uploads");
    const files: { path: string; name: string }[] = [];
    const usedNames = new Set<string>();
    for (const id of unique) {
      let doc: SupplierInvoiceDocument;
      try {
        doc = await this.findOne(id, user);
      } catch {
        continue; // inaccessible or missing — skip silently
      }
      // Include the primary scan plus any extra attachments on the invoice.
      const urls = [doc.attachmentUrl, ...(doc.attachments || [])].filter(
        Boolean,
      ) as string[];
      const base =
        `${doc.supplierName || "faktura"}-${doc.invoiceNumber || String(doc._id)}`
          .replace(/[^a-zA-Z0-9-_åäöÅÄÖ ]/g, "")
          .trim() || "faktura";
      for (const url of urls) {
        const rel = String(url).replace(/^\/+/, "");
        const abs = path.join(process.cwd(), rel);
        // Guard against path traversal — must resolve inside ./uploads.
        if (!abs.startsWith(uploadsRoot)) continue;
        if (!fs.existsSync(abs)) continue;
        const ext = path.extname(abs) || ".pdf";
        let name = `${base}${ext}`;
        let i = 2;
        while (usedNames.has(name.toLowerCase())) {
          name = `${base}-${i}${ext}`;
          i += 1;
        }
        usedNames.add(name.toLowerCase());
        files.push({ path: abs, name });
      }
    }

    if (!files.length) {
      throw new NotFoundException(
        "None of the selected invoices have an attached document",
      );
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="purchase-invoices.zip"',
    );

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      this.logger.error("Zip stream failed", err as Error);
      try {
        res.status(500).end();
      } catch {
        /* response already gone */
      }
    });
    archive.pipe(res);
    for (const f of files) archive.file(f.path, { name: f.name });
    await archive.finalize();
  }

  async update(id: string, dto: CreateSupplierInvoiceDto, user: AuthUser) {
    const doc = await this.findOne(id, user);
    Object.assign(doc, {
      ...dto,
      companyId: doc.companyId,
      projectId: dto.projectId ?? doc.projectId ?? null,
      amountExclVat: round2(dto.amountExclVat ?? doc.amountExclVat),
      vat: round2(dto.vat ?? doc.vat),
      total: this.computeTotal({
        total: dto.total,
        amountExclVat: dto.amountExclVat ?? doc.amountExclVat,
        vat: dto.vat ?? doc.vat,
      }),
    });
    await doc.save();
    return doc;
  }

  // Append extra files to an invoice (kept alongside the primary scan).
  async addAttachments(id: string, urls: string[], user: AuthUser) {
    const doc = await this.findOne(id, user);
    const clean = (urls || []).map(String).filter(Boolean);
    doc.attachments = [...(doc.attachments || []), ...clean];
    await doc.save();
    return doc;
  }

  // Remove one attached file (the primary scan or an extra) and delete it from
  // disk (best-effort, guarded to stay inside ./uploads).
  async removeAttachment(id: string, url: string, user: AuthUser) {
    const doc = await this.findOne(id, user);
    const target = String(url || "");
    if (!target) throw new BadRequestException("No file specified");
    let matched = false;
    if (doc.attachmentUrl === target) {
      doc.attachmentUrl = null;
      matched = true;
    }
    const before = (doc.attachments || []).length;
    doc.attachments = (doc.attachments || []).filter((u) => u !== target);
    if (doc.attachments.length !== before) matched = true;
    if (matched) {
      this.deleteUploadFile(target);
      await doc.save();
    }
    return doc;
  }

  // Delete a stored file from ./uploads, refusing anything that escapes it.
  private deleteUploadFile(url: string): void {
    try {
      const uploadsRoot = path.join(process.cwd(), "uploads");
      const abs = path.join(process.cwd(), String(url).replace(/^\/+/, ""));
      if (!abs.startsWith(uploadsRoot)) return;
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch (error) {
      this.logger.warn(
        `Could not delete attachment ${url}: ${(error as Error)?.message}`,
      );
    }
  }

  async setStatus(id: string, user: AuthUser, status: SupplierInvoiceStatus) {
    const doc = await this.findOne(id, user);
    doc.status = status;
    if (status === SupplierInvoiceStatus.Approved) {
      doc.approvedAt = doc.approvedAt || new Date();
    } else if (status === SupplierInvoiceStatus.Paid) {
      doc.approvedAt = doc.approvedAt || new Date();
      doc.paidAt = doc.paidAt || new Date();
    } else if (status === SupplierInvoiceStatus.Registered) {
      doc.approvedAt = null;
      doc.paidAt = null;
    }
    // Re-opening a bill re-arms the payment reminders; paying it stops them.
    doc.lastReminderBucket = null;
    doc.lastReminderDay = null;
    await doc.save();
    return doc;
  }

  async remove(id: string, user: AuthUser) {
    const doc = await this.findOne(id, user);
    await this.model.findByIdAndDelete(id).exec();
    return doc;
  }

  // Total supplier cost booked against one project (for its economy view).
  async projectSummary(projectId: string, user: AuthUser) {
    if (!user.companyId) {
      return { totalExclVat: 0, total: 0, count: 0 };
    }
    const docs = await this.model
      .find({ companyId: user.companyId, projectId })
      .select("amountExclVat total")
      .lean()
      .exec();
    return {
      totalExclVat: round2(
        docs.reduce((s, d) => s + (d.amountExclVat || 0), 0),
      ),
      total: round2(docs.reduce((s, d) => s + (d.total || 0), 0)),
      count: docs.length,
    };
  }

  private assertCanAccess(doc: SupplierInvoiceDocument, user: AuthUser) {
    if (!user.companyId || String(doc.companyId) !== String(user.companyId)) {
      throw new ForbiddenException(
        "You do not have access to this supplier invoice",
      );
    }
  }
}
