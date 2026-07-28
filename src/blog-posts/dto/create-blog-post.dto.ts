import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { BlogPostLocale } from "../schemas/blog-post.schema";

export class CreateBlogPostDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  slug?: string;

  @IsOptional()
  @IsEnum(BlogPostLocale)
  locale?: BlogPostLocale;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tag?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImageUrl?: string;

  @IsString()
  contentHtml: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  seoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  seoDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  seoImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  canonicalUrl?: string;

  @IsOptional()
  @IsBoolean()
  noIndex?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
