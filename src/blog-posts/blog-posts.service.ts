import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FilterQuery, Model } from "mongoose";
import sanitizeHtml from "sanitize-html";
import { UserRole } from "../users/schemas/user.schema";
import { CreateBlogPostDto } from "./dto/create-blog-post.dto";
import { UpdateBlogPostDto } from "./dto/update-blog-post.dto";
import {
  BlogPost,
  BlogPostDocument,
  BlogPostLocale,
} from "./schemas/blog-post.schema";

type AuthUser = {
  role: UserRole;
  userId: string;
};

@Injectable()
export class BlogPostsService {
  constructor(
    @InjectModel(BlogPost.name)
    private readonly blogPostModel: Model<BlogPostDocument>,
  ) {}

  async findPublished(locale: BlogPostLocale): Promise<BlogPostDocument[]> {
    return this.blogPostModel
      .find({ locale, isPublished: true })
      .sort({ publishedAt: -1, createdAt: -1 })
      .exec();
  }

  async findPublishedBySlug(
    locale: BlogPostLocale,
    slug: string,
  ): Promise<BlogPostDocument> {
    const post = await this.blogPostModel
      .findOne({ locale, slug, isPublished: true })
      .exec();

    if (!post) {
      throw new NotFoundException(`Published blog post "${slug}" not found`);
    }

    return post;
  }

  async findAllForAdmin(): Promise<BlogPostDocument[]> {
    return this.blogPostModel
      .find()
      .sort({ updatedAt: -1, createdAt: -1 })
      .exec();
  }

  async findOneForAdmin(id: string): Promise<BlogPostDocument> {
    const post = await this.blogPostModel.findById(id).exec();

    if (!post) {
      throw new NotFoundException(`Blog post with ID "${id}" not found`);
    }

    return post;
  }

  async create(
    dto: CreateBlogPostDto,
    user: AuthUser,
  ): Promise<BlogPostDocument> {
    const locale = dto.locale ?? BlogPostLocale.Sv;
    const slug = await this.ensureUniqueSlug(
      locale,
      this.createSlug(dto.slug || dto.title),
    );

    const post = new this.blogPostModel({
      title: dto.title.trim(),
      slug,
      locale,
      excerpt: dto.excerpt?.trim() || "",
      tag: dto.tag?.trim() || "",
      coverImageUrl: dto.coverImageUrl?.trim() || "",
      contentHtml: this.sanitizeContent(dto.contentHtml),
      isPublished: Boolean(dto.isPublished),
      publishedAt: dto.isPublished ? new Date() : null,
      createdByUserId: user.userId,
      updatedByUserId: user.userId,
    });

    return post.save();
  }

  async update(
    id: string,
    dto: UpdateBlogPostDto,
    user: AuthUser,
  ): Promise<BlogPostDocument> {
    const post = await this.findOneForAdmin(id);
    const nextLocale = dto.locale ?? post.locale;
    const nextTitle = dto.title?.trim() || post.title;
    const nextSlugSource = dto.slug?.trim() || dto.title?.trim() || post.slug;
    const nextSlug = await this.ensureUniqueSlug(
      nextLocale,
      this.createSlug(nextSlugSource || nextTitle),
      id,
    );

    const nextIsPublished =
      typeof dto.isPublished === "boolean" ? dto.isPublished : post.isPublished;

    post.title = nextTitle;
    post.slug = nextSlug;
    post.locale = nextLocale;
    post.excerpt = dto.excerpt?.trim() ?? post.excerpt;
    post.tag = dto.tag?.trim() ?? post.tag;
    post.coverImageUrl = dto.coverImageUrl?.trim() ?? post.coverImageUrl;

    if (typeof dto.contentHtml === "string") {
      post.contentHtml = this.sanitizeContent(dto.contentHtml);
    }

    post.isPublished = nextIsPublished;
    post.publishedAt = nextIsPublished ? post.publishedAt || new Date() : null;
    post.updatedByUserId = user.userId;

    await post.save();
    return post;
  }

  async remove(id: string): Promise<BlogPostDocument> {
    const post = await this.findOneForAdmin(id);
    await this.blogPostModel.findByIdAndDelete(id).exec();
    return post;
  }

  private sanitizeContent(contentHtml: string): string {
    return sanitizeHtml(contentHtml || "", {
      allowedTags: [
        "p",
        "br",
        "strong",
        "em",
        "u",
        "s",
        "blockquote",
        "ul",
        "ol",
        "li",
        "a",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "img",
        "span",
        "div",
        "code",
        "pre",
      ],
      allowedAttributes: {
        "*": ["class"],
        a: ["href", "target", "rel"],
        img: ["src", "alt", "title"],
      },
      allowedSchemes: ["http", "https", "mailto"],
      transformTags: {
        a: sanitizeHtml.simpleTransform("a", {
          rel: "noopener noreferrer",
          target: "_blank",
        }),
      },
    });
  }

  private createSlug(value: string): string {
    const normalized = value
      .trim()
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "");

    return normalized || `post-${Date.now()}`;
  }

  private async ensureUniqueSlug(
    locale: BlogPostLocale,
    baseSlug: string,
    excludeId?: string,
  ): Promise<string> {
    let slug = baseSlug;
    let suffix = 1;

    while (await this.slugExists(locale, slug, excludeId)) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    return slug;
  }

  private async slugExists(
    locale: BlogPostLocale,
    slug: string,
    excludeId?: string,
  ): Promise<boolean> {
    const filter: FilterQuery<BlogPostDocument> = { locale, slug };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    const existing = await this.blogPostModel.exists(filter);
    return Boolean(existing);
  }
}
