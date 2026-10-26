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
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { ArticlesService } from "./articles.service";
import { CreateArticleDto } from "./dto/create-article.dto";
import { UpdateArticleDto } from "./dto/update-article.dto";
import { ImportArticlesDto } from "./dto/import-articles.dto";

@Controller("articles")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  // Read access for every company member (workers pick material on site);
  // prices are stripped for workers in the service.
  @Get()
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  findAllAccessible(@Request() req, @Query("supplier") supplier?: string) {
    return this.articlesService.findAccessible(req.user, supplier);
  }

  @Get("next-number")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  getNextArticleNumber(@Request() req, @Query("companyId") companyId?: string) {
    return this.articlesService.getNextArticleNumberForUser(
      req.user,
      companyId,
    );
  }

  @Post()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  create(@Request() req, @Body() createArticleDto: CreateArticleDto) {
    return this.articlesService.create(createArticleDto, req.user);
  }

  @Post("import")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  importPriceList(@Request() req, @Body() dto: ImportArticlesDto) {
    return this.articlesService.importPriceList(dto, req.user);
  }

  @Get(":id")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  findOne(@Request() req, @Param("id") id: string) {
    return this.articlesService.findOne(id, req.user);
  }

  @Put(":id")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  update(
    @Request() req,
    @Param("id") id: string,
    @Body() updateArticleDto: UpdateArticleDto,
  ) {
    return this.articlesService.update(id, updateArticleDto, req.user);
  }

  @Delete(":id")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  remove(@Request() req, @Param("id") id: string) {
    return this.articlesService.remove(id, req.user);
  }
}
