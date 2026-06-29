import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserRole } from '../users/schemas/user.schema';
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
  ) {}

  async create(dto: CreateOfferDto, user: AuthUser): Promise<Offer> {
    const companyId = this.resolveCompanyId(dto.companyId, user);
    const offerNumber = await this.getNextOfferNumber(companyId);

    const offer = new this.offerModel({
      ...dto,
      companyId,
      createdByUserId: user.userId,
      offerNumber,
      date: dto.date || today(),
      contactPersons: dto.contactPersons || [],
      items: dto.items || [],
      subtotal: dto.subtotal ?? 0,
      vat: dto.vat ?? 0,
      total: dto.total ?? 0,
      status: dto.status || OfferStatus.Draft,
    });

    return offer.save();
  }

  async findAccessible(user: AuthUser): Promise<Offer[]> {
    if (user.role === UserRole.SuperAdmin) {
      return this.offerModel.find().sort({ createdAt: -1 }).exec();
    }

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

    Object.assign(offer, {
      ...dto,
      companyId: offer.companyId,
      createdByUserId: offer.createdByUserId,
      offerNumber: offer.offerNumber,
      contactPersons: dto.contactPersons ?? offer.contactPersons,
      items: dto.items ?? offer.items,
      subtotal: dto.subtotal ?? offer.subtotal,
      vat: dto.vat ?? offer.vat,
      total: dto.total ?? offer.total,
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

  private resolveCompanyId(companyId: string | undefined, user: AuthUser): string {
    if (user.role === UserRole.SuperAdmin) {
      if (!companyId) {
        throw new BadRequestException('companyId is required for superadmin offer creation');
      }

      return companyId;
    }

    if (!user.companyId) {
      throw new ForbiddenException('Your account is not attached to a company');
    }

    return user.companyId;
  }

  private assertCanAccess(offer: Offer, user: AuthUser): void {
    if (user.role === UserRole.SuperAdmin) {
      return;
    }

    if (!user.companyId || String(offer.companyId) !== String(user.companyId)) {
      throw new ForbiddenException('You do not have access to this offer');
    }
  }
}
