import { Body, Controller, Get, Post, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Article, ArticleDocument } from "../articles/schemas/article.schema";
import { OfferDraftService } from "./offer-draft.service";

@Controller("offer-draft")
export class OfferDraftController {
  constructor(
    private readonly service: OfferDraftService,
    @InjectModel(Article.name)
    private readonly articleModel: Model<ArticleDocument>,
  ) {}

  // Public so the UI can decide whether to show the "AI draft" button.
  @Get("status")
  status() {
    return { enabled: this.service.enabled };
  }

  @UseGuards(AuthGuard("jwt"))
  @Post("generate")
  async generate(@Request() req, @Body() body: { description?: string }) {
    const description = (body?.description || "").trim();
    if (!description) return { items: [] };

    const companyId = req.user?.companyId;
    const articles = companyId
      ? await this.articleModel
          .find({ companyId, active: true })
          .select("name unit priceExclMoms momsPercent")
          .lean()
          .exec()
      : [];

    const items = await this.service.generate(
      description,
      articles.map((a) => ({
        name: a.name,
        unit: a.unit,
        price: a.priceExclMoms,
        vatRate: a.momsPercent,
      })),
    );
    return { items };
  }
}
