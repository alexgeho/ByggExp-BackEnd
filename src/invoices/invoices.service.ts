import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { Model } from 'mongoose';
import path from 'path';
import { Company, CompanyDocument } from '../company/schemas/company.schema';
import { MailService } from '../mail/mail.service';
import { UserRole } from '../users/schemas/user.schema';
import { CreateInvoiceDto, InvoiceItemDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { generateOCR } from './generate-ocr';
import { Invoice, InvoiceDocument, InvoiceStatus } from './schemas/invoice.schema';
import { launchForInvoicePdf } from './puppeteer-launch';
import {
  buildInvoicePdfHtmlPuppeteer,
  InvoicePdfData,
} from './templates/invoice-pdf.template';

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
};

type InvoiceTotals = {
  subtotal: number;
  vat: number;
  total: number;
};

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    private readonly mailService: MailService,
  ) {}

  // Flip "sent" invoices to "overdue" once their due date has passed. dueDate is
  // stored as a plain YYYY-MM-DD string, so a lexicographic `$lt` against today
  // is a correct date comparison. `$gt: ''` skips invoices with no due date.
  @Cron(CronExpression.EVERY_HOUR)
  async markOverdueInvoices(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const result = await this.invoiceModel.updateMany(
      { status: InvoiceStatus.Sent, dueDate: { $gt: '', $lt: today } },
      { $set: { status: InvoiceStatus.Overdue } },
    );
    if (result.modifiedCount) {
      this.logger.log(`Marked ${result.modifiedCount} invoice(s) overdue`);
    }
  }

  async sendByEmail(
    id: string,
    user: AuthUser,
    email?: string,
    message?: string,
  ): Promise<{ sent: boolean; to: string }> {
    const invoice = await this.findOne(id, user);
    const to = (email || invoice.email || '').trim();
    if (!to) {
      throw new BadRequestException(
        'No recipient email — set the customer email or provide one',
      );
    }
    const pdf = await this.buildInvoicePdf(id, user);
    const result = await this.mailService.sendInvoiceEmail(to, {
      invoiceNumber: invoice.invoiceNumber,
      senderName: invoice.companyFooter?.name,
      dueDate: invoice.dueDate,
      message,
      pdf,
    });

    // Emailing a draft moves it to "sent" (a paid invoice stays paid).
    if (result.sent && invoice.status === InvoiceStatus.Draft) {
      invoice.status = InvoiceStatus.Sent;
      invoice.sentAt = new Date();
      await invoice.save();
    }

    return result;
  }

  async setStatus(
    id: string,
    user: AuthUser,
    status: InvoiceStatus,
  ): Promise<InvoiceDocument> {
    const invoice = await this.findOne(id, user);
    invoice.status = status;
    if (status === InvoiceStatus.Sent) {
      invoice.sentAt = invoice.sentAt || new Date();
    } else if (status === InvoiceStatus.Paid) {
      invoice.paidAt = invoice.paidAt || new Date();
    } else if (status === InvoiceStatus.Draft) {
      invoice.sentAt = null;
      invoice.paidAt = null;
    }
    await invoice.save();
    return invoice;
  }

  // ROT-avdrag is 30% of the labour cost (incl VAT), capped at 50 000 kr per
  // person and year. What's left after the deduction is rounded to the nearest
  // whole krona (öresavrundning) — that rounded amount is what the customer pays.
  private static readonly ROT_RATE = 0.3;
  private static readonly ROT_MAX = 50000;

  private deriveSettlement(
    total: number,
    dto: { rotEnabled?: boolean; rotLaborAmount?: number },
  ): { rotDeduction: number; rounding: number; roundedTotal: number } {
    const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
    const rotDeduction = dto.rotEnabled
      ? Math.min(
          round2(InvoicesService.ROT_RATE * (Number(dto.rotLaborAmount) || 0)),
          InvoicesService.ROT_MAX,
        )
      : 0;
    const payable = total - rotDeduction;
    const roundedTotal = Math.round(payable);
    return { rotDeduction, rounding: round2(roundedTotal - payable), roundedTotal };
  }

  async create(dto: CreateInvoiceDto, user: AuthUser): Promise<Invoice> {
    const companyId = this.resolveCompanyId(dto.companyId, user);
    const invoiceNumber = await this.getNextInvoiceNumber(companyId);
    const totals = this.calculateTotals(dto.items || [], dto.reverseVAT === 'true');
    const settlement = this.deriveSettlement(totals.total, dto);
    const companyFooter = await this.resolveCompanyFooter(companyId, dto);
    // Snapshot the company logo onto the invoice so the PDF shows it (and stays
    // fixed even if the company later changes its logo).
    const company = await this.companyModel
      .findById(companyId)
      .select('logoUrl')
      .lean()
      .exec();
    const logoUrl = dto.logoUrl ?? company?.logoUrl ?? null;

    const invoice = new this.invoiceModel({
      ...dto,
      companyId,
      createdByUserId: user.userId,
      invoiceNumber,
      ocr: generateOCR(invoiceNumber),
      items: dto.items || [],
      subtotal: totals.subtotal,
      vat: totals.vat,
      total: totals.total,
      rotDeduction: settlement.rotDeduction,
      rounding: settlement.rounding,
      roundedTotal: settlement.roundedTotal,
      status: dto.status || InvoiceStatus.Draft,
      companyFooter,
      logoUrl,
    });

    return invoice.save();
  }

  async findAccessible(user: AuthUser): Promise<Invoice[]> {
    // Superadmin is scoped to its own company like any tenant admin — it must
    // never list another company's invoices.
    if (!user.companyId) {
      return [];
    }

    return this.invoiceModel
      .find({ companyId: user.companyId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string, user: AuthUser): Promise<InvoiceDocument> {
    const invoice = await this.invoiceModel.findById(id).exec();

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID "${id}" not found`);
    }

    this.assertCanAccess(invoice, user);
    return invoice;
  }

  // A sent/paid invoice is a booked accounting record — its content is
  // immutable (Bokföringslagen). Only drafts may be edited or deleted, which
  // also keeps the invoice number series gap-free. Corrections go through a
  // credit note.
  private assertDraft(invoice: InvoiceDocument, action: string): void {
    if (invoice.status !== InvoiceStatus.Draft) {
      throw new BadRequestException(
        `A ${invoice.status} invoice cannot be ${action}. Issue a credit note instead.`,
      );
    }
  }

  async update(id: string, dto: UpdateInvoiceDto, user: AuthUser): Promise<InvoiceDocument> {
    const invoice = await this.findOne(id, user);
    this.assertDraft(invoice, 'edited');
    const items = dto.items ?? invoice.items;
    const isReverseVAT = (dto.reverseVAT ?? invoice.reverseVAT) === 'true';
    const totals = this.calculateTotals(items || [], isReverseVAT);
    const settlement = this.deriveSettlement(totals.total, {
      rotEnabled: dto.rotEnabled ?? invoice.rotEnabled,
      rotLaborAmount: dto.rotLaborAmount ?? invoice.rotLaborAmount,
    });

    Object.assign(invoice, {
      ...dto,
      companyId: invoice.companyId,
      createdByUserId: invoice.createdByUserId,
      invoiceNumber: invoice.invoiceNumber,
      ocr: invoice.ocr,
      items,
      subtotal: totals.subtotal,
      vat: totals.vat,
      total: totals.total,
      rotDeduction: settlement.rotDeduction,
      rounding: settlement.rounding,
      roundedTotal: settlement.roundedTotal,
    });

    await invoice.save();
    return invoice;
  }

  async remove(id: string, user: AuthUser): Promise<Invoice> {
    const invoice = await this.findOne(id, user);
    this.assertDraft(invoice, 'deleted');
    await this.invoiceModel.findByIdAndDelete(id).exec();
    return invoice;
  }

  async copy(id: string, user: AuthUser): Promise<Invoice> {
    const source = await this.findOne(id, user);
    const raw = (source as InvoiceDocument).toObject();
    const invoiceNumber = await this.getNextInvoiceNumber(source.companyId);
    const payload = { ...raw } as Record<string, unknown>;

    delete payload._id;
    delete payload.id;
    delete payload.createdAt;
    delete payload.updatedAt;
    delete payload.__v;

    const copy = new this.invoiceModel({
      ...payload,
      invoiceNumber,
      ocr: generateOCR(invoiceNumber),
      status: InvoiceStatus.Draft,
      createdByUserId: user.userId,
    });

    return copy.save();
  }

  // A credit note (kreditfaktura) reverses a booked invoice with negated
  // amounts instead of editing/deleting it. It starts as a draft you can send.
  async createCreditNote(id: string, user: AuthUser): Promise<Invoice> {
    const source = await this.findOne(id, user);
    if (source.status === InvoiceStatus.Draft) {
      throw new BadRequestException(
        'A draft invoice can be edited directly — no credit note needed',
      );
    }
    if (source.creditOfNumber) {
      throw new BadRequestException('A credit note cannot itself be credited');
    }

    const raw = (source as InvoiceDocument).toObject() as Record<string, unknown>;
    const invoiceNumber = await this.getNextInvoiceNumber(source.companyId);
    const neg = (n: unknown) => -(Number(n) || 0);

    ['_id', 'id', 'createdAt', 'updatedAt', '__v', 'sentAt', 'paidAt'].forEach(
      (k) => delete raw[k],
    );

    const creditNote = new this.invoiceModel({
      ...raw,
      invoiceNumber,
      ocr: generateOCR(invoiceNumber),
      status: InvoiceStatus.Draft,
      createdByUserId: user.userId,
      creditOfId: String((source as InvoiceDocument)._id),
      creditOfNumber: source.invoiceNumber,
      date: new Date().toISOString().slice(0, 10),
      items: (source.items || []).map((it) => ({
        ...(it as Record<string, unknown>),
        quantity: neg((it as { quantity?: number }).quantity),
      })),
      subtotal: neg(source.subtotal),
      vat: neg(source.vat),
      total: neg(source.total),
      rotDeduction: neg(source.rotDeduction),
      rounding: neg(source.rounding),
      roundedTotal: neg(source.roundedTotal),
    });

    return creditNote.save();
  }

  async getNextInvoiceNumber(companyId: string): Promise<number> {
    const latest = await this.invoiceModel
      .findOne({ companyId })
      .sort({ invoiceNumber: -1 })
      .select('invoiceNumber')
      .lean()
      .exec();

    const last = latest?.invoiceNumber;
    return typeof last === 'number' && !Number.isNaN(last) ? last + 1 : 1;
  }

  async getNextInvoiceNumberForUser(user: AuthUser, companyId?: string): Promise<{ invoiceNumber: number; ocr: string }> {
    const resolvedCompanyId = this.resolveCompanyId(companyId, user);
    const invoiceNumber = await this.getNextInvoiceNumber(resolvedCompanyId);

    return {
      invoiceNumber,
      ocr: generateOCR(invoiceNumber),
    };
  }

  async buildInvoiceHtml(id: string, user: AuthUser): Promise<string> {
    const invoice = await this.findOne(id, user);
    const data = this.toPdfData(invoice);
    const logoDataUrl = await this.getLogoDataUrl(data.logoUrl);

    return buildInvoicePdfHtmlPuppeteer(data, logoDataUrl);
  }

  async buildInvoicePdf(id: string, user: AuthUser): Promise<Buffer> {
    const html = await this.buildInvoiceHtml(id, user);
    const browser = await launchForInvoicePdf();

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
        preferCSSPageSize: true,
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  private resolveCompanyId(_companyId: string | undefined, user: AuthUser): string {
    // Every actor (superadmin included) creates only within its own company.
    if (!user.companyId) {
      throw new ForbiddenException('Your account is not attached to a company');
    }

    return user.companyId;
  }

  private assertCanAccess(invoice: Invoice, user: AuthUser): void {
    if (!user.companyId || String(invoice.companyId) !== String(user.companyId)) {
      throw new ForbiddenException('You do not have access to this invoice');
    }
  }

  private calculateTotals(items: InvoiceItemDto[], reverseVAT: boolean): InvoiceTotals {
    const subtotal = items.reduce((sum, item) => {
      const quantity = Number(item.quantity ?? 0);
      const price = Number(item.price ?? 0);
      const discount = Number(item.discount ?? 0);

      return sum + quantity * price * (1 - discount / 100);
    }, 0);
    const vat = reverseVAT
      ? 0
      : items.reduce((sum, item) => {
        const quantity = Number(item.quantity ?? 0);
        const price = Number(item.price ?? 0);
        const discount = Number(item.discount ?? 0);
        const vatRate = Number(item.vatRate ?? 25);

        return sum + quantity * price * (1 - discount / 100) * (vatRate / 100);
      }, 0);

    return {
      subtotal,
      vat,
      total: subtotal + vat,
    };
  }

  private async resolveCompanyFooter(
    companyId: string,
    dto: CreateInvoiceDto | UpdateInvoiceDto,
  ) {
    if (dto.companyFooter) {
      return dto.companyFooter;
    }

    const company = await this.companyModel.findById(companyId).lean().exec();

    // The F-skatt toggle is stored as a boolean-ish flag ("true"/"false"); turn
    // it into the label the invoice footer should print.
    const fskatt = company?.vatStatus;
    const vatStatus =
      fskatt === 'true'
        ? 'Godkänd för F-skatt'
        : !fskatt || fskatt === 'false'
          ? ''
          : fskatt;

    return {
      name: company?.name || '',
      address: company?.address || '',
      city: company?.city || '',
      phone: company?.phone || '',
      email: company?.email || '',
      website: company?.website || '',
      orgNumber: company?.orgNumber || '',
      vatNumber: company?.vatNumber || '',
      vatStatus,
    };
  }

  private toPdfData(invoice: Invoice): InvoicePdfData {
    return {
      logoUrl: invoice.logoUrl,
      invoiceNumber: String(invoice.invoiceNumber),
      companyName: invoice.companyName,
      vatNumber: invoice.vatNumber,
      address: invoice.address,
      postalCode: invoice.postalCode,
      customerNumber: invoice.customerNumber,
      date: invoice.date,
      deliveryDate: invoice.deliveryDate,
      ourReference: invoice.ourReference,
      yourReference: invoice.yourReference || invoice.representative,
      orderReference: invoice.orderReference,
      lateInterest: invoice.lateInterest,
      reverseVAT: invoice.reverseVAT,
      items: invoice.items,
      subtotal: invoice.subtotal,
      vat: invoice.vat,
      total: invoice.total,
      rotEnabled: invoice.rotEnabled,
      rotPersonalNumber: invoice.rotPersonalNumber,
      rotProperty: invoice.rotProperty,
      rotDeduction: invoice.rotDeduction,
      rounding: invoice.rounding,
      roundedTotal: invoice.roundedTotal,
      creditOfNumber: invoice.creditOfNumber,
      dueDate: invoice.dueDate,
      ocr: invoice.ocr,
      companyFooter: invoice.companyFooter,
    };
  }

  private async getLogoDataUrl(logoUrl?: string | null): Promise<string> {
    if (!logoUrl || logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      return '';
    }

    const relativePath = logoUrl.startsWith('/') ? logoUrl.slice(1) : logoUrl;
    const candidates = [
      path.join(process.cwd(), relativePath),
      path.join(process.cwd(), 'public', relativePath),
    ];

    for (const filePath of candidates) {
      if (!existsSync(filePath)) {
        continue;
      }

      const buffer = await readFile(filePath);
      const ext = path.extname(filePath).slice(1) || 'png';
      return `data:image/${ext};base64,${buffer.toString('base64')}`;
    }

    return '';
  }
}
