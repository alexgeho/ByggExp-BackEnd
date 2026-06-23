import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { Model } from 'mongoose';
import path from 'path';
import { Company, CompanyDocument } from '../company/schemas/company.schema';
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
  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
  ) {}

  async create(dto: CreateInvoiceDto, user: AuthUser): Promise<Invoice> {
    const companyId = this.resolveCompanyId(dto.companyId, user);
    const invoiceNumber = await this.getNextInvoiceNumber(companyId);
    const totals = this.calculateTotals(dto.items || [], dto.reverseVAT === 'true');
    const companyFooter = await this.resolveCompanyFooter(companyId, dto);

    const invoice = new this.invoiceModel({
      ...dto,
      companyId,
      createdByUserId: user.userId,
      invoiceNumber,
      ocr: generateOCR(invoiceNumber),
      items: dto.items || [],
      subtotal: dto.subtotal ?? totals.subtotal,
      vat: dto.vat ?? totals.vat,
      total: dto.total ?? totals.total,
      status: dto.status || InvoiceStatus.Draft,
      companyFooter,
    });

    return invoice.save();
  }

  async findAccessible(user: AuthUser): Promise<Invoice[]> {
    if (user.role === UserRole.SuperAdmin) {
      return this.invoiceModel.find().sort({ createdAt: -1 }).exec();
    }

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

  async update(id: string, dto: UpdateInvoiceDto, user: AuthUser): Promise<InvoiceDocument> {
    const invoice = await this.findOne(id, user);
    const items = dto.items ?? invoice.items;
    const isReverseVAT = (dto.reverseVAT ?? invoice.reverseVAT) === 'true';
    const totals = this.calculateTotals(items || [], isReverseVAT);

    Object.assign(invoice, {
      ...dto,
      companyId: invoice.companyId,
      createdByUserId: invoice.createdByUserId,
      invoiceNumber: invoice.invoiceNumber,
      ocr: invoice.ocr,
      items,
      subtotal: dto.subtotal ?? totals.subtotal,
      vat: dto.vat ?? totals.vat,
      total: dto.total ?? totals.total,
    });

    await invoice.save();
    return invoice;
  }

  async remove(id: string, user: AuthUser): Promise<Invoice> {
    const invoice = await this.findOne(id, user);
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

  private resolveCompanyId(companyId: string | undefined, user: AuthUser): string {
    if (user.role === UserRole.SuperAdmin) {
      if (!companyId) {
        throw new BadRequestException('companyId is required for superadmin invoice creation');
      }
      return companyId;
    }

    if (!user.companyId) {
      throw new ForbiddenException('Your account is not attached to a company');
    }

    return user.companyId;
  }

  private assertCanAccess(invoice: Invoice, user: AuthUser): void {
    if (user.role === UserRole.SuperAdmin) {
      return;
    }

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

    return {
      name: company?.name || '',
      address: company?.address || '',
      email: company?.email || '',
      vatStatus: 'Godkänd för F-skatt',
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
