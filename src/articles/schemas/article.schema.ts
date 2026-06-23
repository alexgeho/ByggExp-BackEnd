import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ArticleDocument = Article & Document;

@Schema({ timestamps: true })
export class Article {
  @Prop({ ref: 'Company', required: true, index: true })
  companyId: string;

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
}

export const ArticleSchema = SchemaFactory.createForClass(Article);

ArticleSchema.index({ companyId: 1, articleNumber: 1 });
