import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UserRole } from "../users/schemas/user.schema";
import { CreateArticleDto } from "./dto/create-article.dto";
import { UpdateArticleDto } from "./dto/update-article.dto";
import { ImportArticlesDto } from "./dto/import-articles.dto";
import { Article, ArticleDocument } from "./schemas/article.schema";

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
};

@Injectable()
export class ArticlesService {
  constructor(
    @InjectModel(Article.name) private articleModel: Model<ArticleDocument>,
  ) {}

  async create(dto: CreateArticleDto, user: AuthUser): Promise<Article> {
    const companyId = this.resolveCompanyId(dto.companyId, user);
    const scopeFilter = companyId
      ? { companyId }
      : { createdByUserId: user.userId };
    const articleNumber =
      dto.articleNumber || (await this.getNextArticleNumber(scopeFilter));

    const article = new this.articleModel({
      ...dto,
      companyId,
      createdByUserId: user.userId,
      articleNumber,
    });

    return article.save();
  }

  // Upserts a grossist price list chunk: same supplier + article number updates
  // the prices, new numbers become new material articles.
  async importPriceList(
    dto: ImportArticlesDto,
    user: AuthUser,
  ): Promise<{ created: number; updated: number }> {
    if (!user.companyId) {
      throw new ForbiddenException("No company");
    }
    const supplier = dto.supplier.trim();
    const factor = 1 + (Number(dto.markupPercent) || 0) / 100;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const ops = dto.rows
      .filter((r) => r.articleNumber?.trim())
      .map((r) => {
        const purchase = round2(Number(r.purchasePrice) || 0);
        return {
          updateOne: {
            filter: {
              companyId: user.companyId,
              supplier,
              articleNumber: r.articleNumber.trim(),
            },
            update: {
              $set: {
                name: (r.name || "").trim(),
                unit: (r.unit || "st").trim() || "st",
                purchasePriceExclMoms: purchase,
                priceExclMoms: round2(purchase * factor),
              },
              $setOnInsert: {
                createdByUserId: user.userId,
                kontering: "Varor 25%",
                momsPercent: 25,
                active: true,
              },
            },
            upsert: true,
          },
        };
      });
    if (!ops.length) return { created: 0, updated: 0 };
    const res = await this.articleModel.bulkWrite(ops, { ordered: false });
    return { created: res.upsertedCount, updated: res.modifiedCount };
  }

  async findAccessible(user: AuthUser): Promise<Article[]> {
    // Superadmin is scoped to its own company like any tenant admin — it must
    // never list another company's articles.
    if (!user.companyId) {
      return [];
    }

    return this.articleModel
      .find({ companyId: user.companyId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string, user: AuthUser): Promise<ArticleDocument> {
    const article = await this.articleModel.findById(id).exec();

    if (!article) {
      throw new NotFoundException(`Article with ID "${id}" not found`);
    }

    this.assertCanAccess(article, user);
    return article;
  }

  async update(
    id: string,
    dto: UpdateArticleDto,
    user: AuthUser,
  ): Promise<ArticleDocument> {
    const article = await this.findOne(id, user);

    Object.assign(article, {
      ...dto,
      companyId: article.companyId,
      createdByUserId: article.createdByUserId,
    });

    await article.save();
    return article;
  }

  async remove(id: string, user: AuthUser): Promise<Article> {
    const article = await this.findOne(id, user);
    await this.articleModel.findByIdAndDelete(id).exec();
    return article;
  }

  async getNextArticleNumber(filter: {
    companyId?: string;
    createdByUserId?: string;
  }): Promise<string> {
    const articles = await this.articleModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();

    if (!articles.length) {
      return "1";
    }

    const numbers = articles
      .map((article) => parseInt(article.articleNumber, 10))
      .filter((value) => !Number.isNaN(value));

    if (!numbers.length) {
      return "1";
    }

    return String(Math.max(...numbers) + 1);
  }

  async getNextArticleNumberForUser(
    user: AuthUser,
    companyId?: string,
  ): Promise<{ nextNumber: string }> {
    const resolvedCompanyId = this.resolveCompanyId(companyId, user);
    const scopeFilter = resolvedCompanyId
      ? { companyId: resolvedCompanyId }
      : { createdByUserId: user.userId };
    const nextNumber = await this.getNextArticleNumber(scopeFilter);

    return { nextNumber };
  }

  private resolveCompanyId(
    _companyId: string | undefined,
    user: AuthUser,
  ): string {
    // Every actor (superadmin included) creates only within its own company.
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }

    return user.companyId;
  }

  private assertCanAccess(article: Article, user: AuthUser): void {
    if (
      !user.companyId ||
      String(article.companyId) !== String(user.companyId)
    ) {
      throw new ForbiddenException("You do not have access to this article");
    }
  }
}
