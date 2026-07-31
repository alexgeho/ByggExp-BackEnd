import { Body, Controller, Get, Put, Query, Res, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";
import type { Response } from "express";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { BlogPostLocale } from "../blog-posts/schemas/blog-post.schema";
import { SiteSeoService } from "./site-seo.service";

class UpdateSiteSeoDto {
  @IsOptional() @IsString() @MaxLength(180) title?: string;
  @IsOptional() @IsString() @MaxLength(320) description?: string;
  @IsOptional() @IsString() @MaxLength(500) canonicalUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) imageUrl?: string;
  @IsOptional() @IsBoolean() noIndex?: boolean;
}

@Controller("site-seo")
export class SiteSeoController {
  constructor(private readonly service: SiteSeoService) {}

  @Public()
  @Get("public")
  async getPublic(
    @Query("locale") locale: BlogPostLocale = BlogPostLocale.Sv,
    @Res() res: Response,
  ) {
    const seo = await this.service.get(locale);
    // NestJS serializes `null` as an empty body; clients fail on response.json().
    return res.status(200).json(seo ?? null);
  }

  @Get()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  async get(
    @Query("locale") locale: BlogPostLocale = BlogPostLocale.Sv,
    @Res() res: Response,
  ) {
    const seo = await this.service.get(locale);
    return res.status(200).json(seo ?? null);
  }

  @Put()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  update(
    @Query("locale") locale: BlogPostLocale = BlogPostLocale.Sv,
    @Body() dto: UpdateSiteSeoDto,
  ) {
    return this.service.update(locale, dto);
  }
}
