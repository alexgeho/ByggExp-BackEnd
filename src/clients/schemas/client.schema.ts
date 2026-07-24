import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ClientDocument = Client & Document;

export enum ClientType {
  Company = 'company',
  Private = 'private',
}

@Schema({ timestamps: true })
export class Client {
  @Prop({ ref: 'Company', required: true, index: true })
  companyId: string;

  @Prop({ ref: 'User', required: true })
  createdByUserId: string;

  @Prop({ enum: ClientType, default: ClientType.Company })
  clientType: ClientType;

  @Prop({ default: '' })
  companyName: string;

  @Prop({ default: '' })
  customerNumber: string;

  @Prop({ default: '' })
  address: string;

  @Prop({ default: '' })
  postalCode: string;

  @Prop({ default: '' })
  city: string;

  @Prop({ default: 'Sverige' })
  country: string;

  @Prop({ default: '' })
  contactPerson: string;

  @Prop({ default: '' })
  email: string;

  @Prop({ default: '' })
  phone: string;

  @Prop({ default: '' })
  mobile: string;

  @Prop({ default: '' })
  orgNumber: string;

  @Prop({ default: '' })
  vatNumber: string;

  @Prop({ default: '' })
  firstName: string;

  @Prop({ default: '' })
  lastName: string;

  @Prop({ default: '' })
  personalNumber: string;

  @Prop({ default: '' })
  website: string;

  @Prop({ default: '' })
  notes: string;

  @Prop({ default: 'SEK' })
  currency: string;

  @Prop({ default: '' })
  paymentTerms: string;

  @Prop({ default: '0' })
  discount: string;

  @Prop({ type: Boolean, default: false })
  reverseVAT: boolean;

  @Prop({ type: Boolean, default: true })
  active: boolean;

  @Prop({ default: '' })
  gln: string;

  @Prop({ default: 'Svenska' })
  documentLanguage: string;

  @Prop({ default: '' })
  secretCopyEmail: string;

  @Prop({ default: '' })
  deliveryTerms: string;

  @Prop({ default: '' })
  deliveryMethod: string;

  @Prop({ type: [String], default: [] })
  customerGroups: string[];
}

export const ClientSchema = SchemaFactory.createForClass(Client);

ClientSchema.index({ companyId: 1, customerNumber: 1 });
