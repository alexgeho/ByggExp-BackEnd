import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import { BlogPostLocale } from "../../blog-posts/schemas/blog-post.schema";

export type SiteSeoDocument = SiteSeo & Document;

@Schema({ timestamps: true })
export class SiteSeo {
  @Prop({ required: true, enum: BlogPostLocale, unique: true })
  locale: BlogPostLocale;

  @Prop({ default: "" })
  title: string;

  @Prop({ default: "" })
  description: string;

  @Prop({ default: "" })
  canonicalUrl: string;

  @Prop({ default: "" })
  imageUrl: string;

  @Prop({ type: Boolean, default: false })
  noIndex: boolean;
}

export const SiteSeoSchema = SchemaFactory.createForClass(SiteSeo);
