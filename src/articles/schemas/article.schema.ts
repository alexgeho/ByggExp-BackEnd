import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ArticleDocument = Article & Document;

export enum HouseworkType {
  None = 'none',
  Rot = 'rot',
  Rut = 'rut',
}

@Schema({ timestamps: true })
export class Article {
  @Prop({ ref: 'Company', index: true })
  companyId?: string;

  @Prop({ ref: 'User', required: true })
  createdByUserId: string;

  @Prop({ default: '' })
  articleNumber: string;

  @Prop({ default: '' })
  name: string;

  @Prop({ default: 'Tjänster 25%' })
  kontering: string;

  @Prop({ type: Number, default: 25 })
  momsPercent: number;

  @Prop({ type: Number, default: 0 })
  priceExclMoms: number;

  @Prop({ type: Boolean, default: true })
  active: boolean;

  @Prop({ default: '' })
  nameEnglish: string;

  @Prop({ default: '' })
  notes: string;

  @Prop({ default: 'st' })
  unit: string;

  @Prop({ type: Number, default: 0 })
  purchasePriceExclMoms: number;

  @Prop({ enum: HouseworkType, default: HouseworkType.None })
  houseworkType: HouseworkType;

  @Prop({ type: [String], default: [] })
  articleGroups: string[];
}

export const ArticleSchema = SchemaFactory.createForClass(Article);

ArticleSchema.index({ companyId: 1, articleNumber: 1 });
ArticleSchema.index({ createdByUserId: 1, articleNumber: 1 });
