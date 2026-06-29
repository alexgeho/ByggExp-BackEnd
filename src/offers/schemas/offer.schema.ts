import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OfferDocument = Offer & Document;

export enum OfferStatus {
  Draft = 'draft',
  Sent = 'sent',
  Accepted = 'accepted',
  Rejected = 'rejected',
}

@Schema({ _id: false })
export class OfferContactPerson {
  @Prop({ default: '' })
  role?: string;

  @Prop({ default: '' })
  name?: string;
}

const OfferContactPersonSchema = SchemaFactory.createForClass(OfferContactPerson);

@Schema({ timestamps: true, strict: false })
export class Offer {
  @Prop({ ref: 'Company', required: true, index: true })
  companyId: string;

  @Prop({ ref: 'User', required: true })
  createdByUserId: string;

  @Prop({ type: Number, required: true })
  offerNumber: number;

  @Prop({ default: '' })
  companyName: string;

  @Prop({ default: '' })
  email: string;

  @Prop({ default: '' })
  date: string;

  @Prop({ default: '' })
  validUntil: string;

  @Prop({ default: '' })
  subtitle: string;

  @Prop({ default: '' })
  priceText: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  clarifications: string;

  @Prop({ type: [OfferContactPersonSchema], default: [] })
  contactPersons: OfferContactPerson[];

  @Prop({ type: String, default: null })
  logoUrl?: string | null;

  @Prop({ type: Array, default: [] })
  items: unknown[];

  @Prop({ type: Number, default: 0 })
  subtotal: number;

  @Prop({ type: Number, default: 0 })
  vat: number;

  @Prop({ type: Number, default: 0 })
  total: number;

  @Prop({ enum: OfferStatus, default: OfferStatus.Draft })
  status: OfferStatus;
}

export const OfferSchema = SchemaFactory.createForClass(Offer);

OfferSchema.index({ companyId: 1, offerNumber: 1 }, { unique: true });
