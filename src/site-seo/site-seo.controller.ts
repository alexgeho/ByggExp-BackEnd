import { Body, Controller, Get, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";
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
  getPublic(@Query("locale") locale: BlogPostLocale = BlogPostLocale.Sv) {
    return this.service.get(locale);
  }

  @Get()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  get(@Query("locale") locale: BlogPostLocale = BlogPostLocale.Sv) {
    return this.service.get(locale);
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
