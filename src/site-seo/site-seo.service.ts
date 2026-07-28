import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { BlogPostLocale } from "../blog-posts/schemas/blog-post.schema";
import { SiteSeo, SiteSeoDocument } from "./schemas/site-seo.schema";

export type SiteSeoInput = {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  imageUrl?: string;
  noIndex?: boolean;
};

@Injectable()
export class SiteSeoService {
  constructor(@InjectModel(SiteSeo.name) private readonly model: Model<SiteSeoDocument>) {}

  async get(locale: BlogPostLocale): Promise<SiteSeoDocument | null> {
    return this.model.findOne({ locale }).exec();
  }

  async update(locale: BlogPostLocale, input: SiteSeoInput): Promise<SiteSeoDocument> {
    return this.model
      .findOneAndUpdate(
        { locale },
        {
          $set: {
            title: input.title?.trim() ?? "",
            description: input.description?.trim() ?? "",
            canonicalUrl: input.canonicalUrl?.trim() ?? "",
            imageUrl: input.imageUrl?.trim() ?? "",
            noIndex: Boolean(input.noIndex),
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
  }
}
