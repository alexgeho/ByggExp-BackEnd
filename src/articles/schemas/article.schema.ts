import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type ArticleDocument = Article & Document;

export enum HouseworkType {
  None = "none",
  Rot = "rot",
  Rut = "rut",
}

@Schema({ timestamps: true })
export class Article {
  @Prop({ ref: "Company", index: true })
  companyId?: string;

  @Prop({ ref: "User", required: true })
  createdByUserId: string;

  @Prop({ default: "" })
  articleNumber: string;

  @Prop({ default: "" })
  name: string;

  @Prop({ default: "Tjänster 25%" })
  kontering: string;

  @Prop({ type: Number, default: 25 })
  momsPercent: number;

  @Prop({ type: Number, default: 0 })
  priceExclMoms: number;

  @Prop({ type: Boolean, default: true })
  active: boolean;

  @Prop({ default: "" })
  nameEnglish: string;

  @Prop({ default: "" })
  notes: string;

  @Prop({ default: "st" })
  unit: string;

  @Prop({ type: Number, default: 0 })
  purchasePriceExclMoms: number;

  // Grossist price files: list price (Huvudprislista/Kopparpriser) and net
  // price (Nettoprislista) kept apart; purchasePriceExclMoms = net ?? list.
  @Prop({ type: Number, default: null })
  listPurchasePrice?: number | null;

  @Prop({ type: Number, default: null })
  netPurchasePrice?: number | null;

  @Prop({ type: String, enum: HouseworkType, default: HouseworkType.None })
  houseworkType: HouseworkType;

  @Prop({ type: [String], default: [] })
  articleGroups: string[];

  // Grossist the row came from (Ahlsell, Dahl, Rexel…) when imported from a
  // price list; empty for articles made by hand.
  @Prop({ default: "" })
  supplier: string;

  // Rabattgrupp from the grossist's price list; the company's rabattbrev
  // gives a discount per group (see price-list-merge.ts).
  @Prop({ default: "" })
  discountGroup: string;
}

export const ArticleSchema = SchemaFactory.createForClass(Article);

ArticleSchema.index({ companyId: 1, articleNumber: 1 });
ArticleSchema.index({ companyId: 1, supplier: 1, articleNumber: 1 });
ArticleSchema.index({ createdByUserId: 1, articleNumber: 1 });
