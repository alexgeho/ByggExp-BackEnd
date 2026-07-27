import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { BlogPostsService } from "./blog-posts.service";
import { CreateBlogPostDto } from "./dto/create-blog-post.dto";
import { UpdateBlogPostDto } from "./dto/update-blog-post.dto";
import { BlogPostLocale } from "./schemas/blog-post.schema";

type AuthenticatedRequest = {
  user: {
    userId: string;
    role: UserRole;
  };
};

@Controller("blog-posts")
export class BlogPostsController {
  constructor(private readonly blogPostsService: BlogPostsService) {}

  @Public()
  @Get("public")
  findPublished(@Query("locale") locale: BlogPostLocale = BlogPostLocale.Sv) {
    return this.blogPostsService.findPublished(locale);
  }

  @Public()
  @Get("public/:slug")
  findPublishedBySlug(
    @Param("slug") slug: string,
    @Query("locale") locale: BlogPostLocale = BlogPostLocale.Sv,
  ) {
    return this.blogPostsService.findPublishedBySlug(locale, slug);
  }

  @Get()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  findAllForAdmin() {
    return this.blogPostsService.findAllForAdmin();
  }

  @Get(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  findOneForAdmin(@Param("id") id: string) {
    return this.blogPostsService.findOneForAdmin(id);
  }

  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreateBlogPostDto) {
    return this.blogPostsService.create(dto, req.user);
  }

  @Put(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  update(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateBlogPostDto,
  ) {
    return this.blogPostsService.update(id, dto, req.user);
  }

  @Delete(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  remove(@Param("id") id: string) {
    return this.blogPostsService.remove(id);
  }
}
