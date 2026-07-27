import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { UserRole } from '../users/schemas/user.schema';
import { Company, CompanyDocument } from '../company/schemas/company.schema';
import { launchForInvoicePdf } from '../invoices/puppeteer-launch';
import { buildOfferPdfHtml, OfferPdfData } from './templates/offer-pdf.template';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { Offer, OfferDocument, OfferStatus } from './schemas/offer.schema';

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
};

const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class OffersService {
  constructor(
    @InjectModel(Offer.name) private offerModel: Model<OfferDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
  ) {}

  // Totals are computed from the line items server-side so the offer PDF and a
  // converted invoice always agree, regardless of what the client sends.
  private computeOfferTotals(
    items: Array<{
      quantity?: number;
      price?: number;
      discount?: number;
      vatRate?: number;
    }> = [],
  ): { subtotal: number; vat: number; total: number } {
    const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
    let subtotal = 0;
    let vat = 0;
    for (const it of items) {
      const q = Number(it?.quantity || 0);
      const p = Number(it?.price || 0);
      const d = Number(it?.discount || 0);
      const r = Number(it?.vatRate ?? 25);
      const net = q * p * (1 - d / 100);
      subtotal += net;
      vat += net * (r / 100);
    }
    return { subtotal: round2(subtotal), vat: round2(vat), total: round2(subtotal + vat) };
  }

  async create(dto: CreateOfferDto, user: AuthUser): Promise<Offer> {
    const companyId = this.resolveCompanyId(dto.companyId, user);
    const offerNumber = await this.getNextOfferNumber(companyId);
    const totals = this.computeOfferTotals(dto.items || []);
    // Snapshot the company logo so the offer PDF shows it.
    const company = await this.companyModel
      .findById(companyId)
      .select('logoUrl')
      .lean()
      .exec();

    const offer = new this.offerModel({
      ...dto,
      companyId,
      createdByUserId: user.userId,
      offerNumber,
      date: dto.date || today(),
      contactPersons: dto.contactPersons || [],
      items: dto.items || [],
      subtotal: totals.subtotal,
      vat: totals.vat,
      total: totals.total,
      status: dto.status || OfferStatus.Draft,
      logoUrl: dto.logoUrl ?? company?.logoUrl ?? null,
    });

    return offer.save();
  }

  async buildOfferHtml(id: string, user: AuthUser): Promise<string> {
    const offer = await this.findOne(id, user);
    const companyFooter = await this.resolveCompanyFooter(offer.companyId);
    const logoDataUrl = await this.getLogoDataUrl(offer.logoUrl);

    const data: OfferPdfData = {
      offerNumber: String(offer.offerNumber),
      companyName: offer.companyName,
      email: offer.email,
      date: offer.date,
      validUntil: offer.validUntil,
      subtitle: offer.subtitle,
      priceText: offer.priceText,
      description: offer.description,
      clarifications: offer.clarifications,
      contactPersons: offer.contactPersons,
      items: (offer.items || []).map((it) => ({
        description: it?.description,
        quantity: it?.quantity,
        unit: it?.unit,
        price: it?.price,
        discount: it?.discount,
        vatRate: it?.vatRate,
      })),
      subtotal: offer.subtotal,
      vat: offer.vat,
      total: offer.total,
      companyFooter,
    };

    return buildOfferPdfHtml(data, logoDataUrl);
  }

  async buildOfferPdf(id: string, user: AuthUser): Promise<Buffer> {
    const html = await this.buildOfferHtml(id, user);
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

  private async resolveCompanyFooter(companyId: string) {
    const company = await this.companyModel.findById(companyId).lean().exec();
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

  async findAccessible(user: AuthUser): Promise<Offer[]> {
    // Superadmin is scoped to its own company like any tenant admin — it must
    // never list another company's offers.
    if (!user.companyId) {
      return [];
    }

    return this.offerModel
      .find({ companyId: user.companyId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string, user: AuthUser): Promise<OfferDocument> {
    const offer = await this.offerModel.findById(id).exec();

    if (!offer) {
      throw new NotFoundException(`Offer with ID "${id}" not found`);
    }

    this.assertCanAccess(offer, user);
    return offer;
  }

  async update(id: string, dto: UpdateOfferDto, user: AuthUser): Promise<OfferDocument> {
    const offer = await this.findOne(id, user);

    const items = dto.items ?? offer.items;
    const totals = this.computeOfferTotals(items || []);

    Object.assign(offer, {
      ...dto,
      companyId: offer.companyId,
      createdByUserId: offer.createdByUserId,
      offerNumber: offer.offerNumber,
      contactPersons: dto.contactPersons ?? offer.contactPersons,
      items,
      subtotal: totals.subtotal,
      vat: totals.vat,
      total: totals.total,
    });

    await offer.save();
    return offer;
  }

  async remove(id: string, user: AuthUser): Promise<Offer> {
    const offer = await this.findOne(id, user);
    await this.offerModel.findByIdAndDelete(id).exec();
    return offer;
  }

  async copy(id: string, user: AuthUser): Promise<Offer> {
    const source = await this.findOne(id, user);
    const raw = (source as OfferDocument).toObject();
    const offerNumber = await this.getNextOfferNumber(source.companyId);
    const payload = { ...raw } as Record<string, unknown>;

    delete payload._id;
    delete payload.id;
    delete payload.createdAt;
    delete payload.updatedAt;
    delete payload.__v;

    const copy = new this.offerModel({
      ...payload,
      offerNumber,
      status: OfferStatus.Draft,
      createdByUserId: user.userId,
    });

    return copy.save();
  }

  async getNextOfferNumber(companyId: string): Promise<number> {
    const latest = await this.offerModel
      .findOne({ companyId })
      .sort({ offerNumber: -1 })
      .select('offerNumber')
      .lean()
      .exec();

    const last = latest?.offerNumber;
    return typeof last === 'number' && !Number.isNaN(last) ? last + 1 : 1;
  }

  async getNextOfferNumberForUser(user: AuthUser, companyId?: string): Promise<{ offerNumber: number }> {
    const resolvedCompanyId = this.resolveCompanyId(companyId, user);
    const offerNumber = await this.getNextOfferNumber(resolvedCompanyId);

    return { offerNumber };
  }

  private resolveCompanyId(_companyId: string | undefined, user: AuthUser): string {
    // Every actor (superadmin included) creates only within its own company.
    if (!user.companyId) {
      throw new ForbiddenException('Your account is not attached to a company');
    }

    return user.companyId;
  }

  private assertCanAccess(offer: Offer, user: AuthUser): void {
    if (!user.companyId || String(offer.companyId) !== String(user.companyId)) {
      throw new ForbiddenException('You do not have access to this offer');
    }
  }
}
