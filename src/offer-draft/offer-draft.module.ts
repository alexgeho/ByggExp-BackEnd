import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Article, ArticleSchema } from "../articles/schemas/article.schema";
import { OfferDraftController } from "./offer-draft.controller";
import { OfferDraftService } from "./offer-draft.service";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Article.name, schema: ArticleSchema }]),
  ],
  controllers: [OfferDraftController],
  providers: [OfferDraftService],
})
export class OfferDraftModule {}
