import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ArticlesController } from "./articles.controller";
import { ArticlesService } from "./articles.service";
import { Article, ArticleSchema } from "./schemas/article.schema";
import {
  MaterialSupplier,
  MaterialSupplierSchema,
} from "../material-orders/schemas/material-supplier.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Article.name, schema: ArticleSchema },
      { name: MaterialSupplier.name, schema: MaterialSupplierSchema },
    ]),
  ],
  controllers: [ArticlesController],
  providers: [ArticlesService],
  exports: [ArticlesService],
})
export class ArticlesModule {}
