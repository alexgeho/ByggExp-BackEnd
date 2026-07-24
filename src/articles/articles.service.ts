import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserRole } from '../users/schemas/user.schema';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { Article, ArticleDocument } from './schemas/article.schema';

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
    const scopeFilter = companyId ? { companyId } : { createdByUserId: user.userId };
    const articleNumber = dto.articleNumber || await this.getNextArticleNumber(scopeFilter);

    const article = new this.articleModel({
      ...dto,
      companyId,
      createdByUserId: user.userId,
      articleNumber,
    });

    return article.save();
  }

  async findAccessible(user: AuthUser): Promise<Article[]> {
    if (user.role === UserRole.SuperAdmin) {
      return this.articleModel.find().sort({ createdAt: -1 }).exec();
    }

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

  async update(id: string, dto: UpdateArticleDto, user: AuthUser): Promise<ArticleDocument> {
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

  async getNextArticleNumber(filter: { companyId?: string; createdByUserId?: string }): Promise<string> {
    const articles = await this.articleModel.find(filter).sort({ createdAt: -1 }).exec();

    if (!articles.length) {
      return '1';
    }

    const numbers = articles
      .map((article) => parseInt(article.articleNumber, 10))
      .filter((value) => !Number.isNaN(value));

    if (!numbers.length) {
      return '1';
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

  private resolveCompanyId(companyId: string | undefined, user: AuthUser): string | undefined {
    if (user.role === UserRole.SuperAdmin) {
      return companyId || undefined;
    }

    if (!user.companyId) {
      throw new ForbiddenException('Your account is not attached to a company');
    }

    return user.companyId;
  }

  private assertCanAccess(article: Article, user: AuthUser): void {
    if (user.role === UserRole.SuperAdmin) {
      return;
    }

    if (!user.companyId || String(article.companyId) !== String(user.companyId)) {
      throw new ForbiddenException('You do not have access to this article');
    }
  }
}
