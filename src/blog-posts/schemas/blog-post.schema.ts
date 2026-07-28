import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type BlogPostDocument = BlogPost & Document;

export enum BlogPostLocale {
  Sv = "sv",
  En = "en",
  Ru = "ru",
}

@Schema({ timestamps: true })
export class BlogPost {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  slug: string;

  @Prop({ enum: BlogPostLocale, default: BlogPostLocale.Sv, index: true })
  locale: BlogPostLocale;

  @Prop({ default: "" })
  excerpt: string;

  @Prop({ default: "" })
  tag: string;

  @Prop({ default: "" })
  coverImageUrl: string;

  @Prop({ default: "" })
  contentHtml: string;

  @Prop({ default: "" })
  seoTitle: string;

  @Prop({ default: "" })
  seoDescription: string;

  @Prop({ default: "" })
  seoImageUrl: string;

  @Prop({ default: "" })
  canonicalUrl: string;

  @Prop({ type: Boolean, default: false })
  noIndex: boolean;

  @Prop({ type: Boolean, default: false, index: true })
  isPublished: boolean;

  @Prop({ type: Date, default: null, index: true })
  publishedAt: Date | null;

  @Prop({ type: String, ref: "User", required: true })
  createdByUserId: string;

  @Prop({ type: String, ref: "User", default: null })
  updatedByUserId: string | null;
}

export const BlogPostSchema = SchemaFactory.createForClass(BlogPost);

BlogPostSchema.index({ locale: 1, slug: 1 }, { unique: true });
BlogPostSchema.index({ locale: 1, isPublished: 1, publishedAt: -1 });
