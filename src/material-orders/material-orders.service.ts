import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UserRole } from "../users/schemas/user.schema";
import { Article, ArticleDocument } from "../articles/schemas/article.schema";
import { Project, ProjectDocument } from "../projects/schemas/project.schema";
import { Company, CompanyDocument } from "../company/schemas/company.schema";
import { User, UserDocument } from "../users/schemas/user.schema";
import {
  MaterialOrder,
  MaterialOrderDocument,
  MaterialOrderStatus,
} from "./schemas/material-order.schema";
import {
  MaterialSupplier,
  MaterialSupplierDocument,
} from "./schemas/material-supplier.schema";
import {
  CreateMaterialOrderDto,
  MaterialOrderRowDto,
  UpdateMaterialOrderDto,
  UpsertMaterialSupplierDto,
} from "./dto/material-order.dto";
import { ORDER_SENDER } from "./senders/order-sender";
import type { OrderSender } from "./senders/order-sender";

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
};

const ADMIN_ROLES = [UserRole.SuperAdmin, UserRole.CompanyAdmin];
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

@Injectable()
export class MaterialOrdersService {
  constructor(
    @InjectModel(MaterialOrder.name)
    private orders: Model<MaterialOrderDocument>,
    @InjectModel(MaterialSupplier.name)
    private suppliers: Model<MaterialSupplierDocument>,
    @InjectModel(Article.name) private articles: Model<ArticleDocument>,
    @InjectModel(Project.name) private projects: Model<ProjectDocument>,
    @InjectModel(Company.name) private companies: Model<CompanyDocument>,
    @InjectModel(User.name) private users: Model<UserDocument>,
    @Inject(ORDER_SENDER) private readonly sender: OrderSender,
  ) {}

  // ---------- access ----------

  private companyOf(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return String(user.companyId);
  }

  private isCompanyAdmin(user: AuthUser) {
    return ADMIN_ROLES.includes(user.role);
  }

  private isMember(project: ProjectDocument, userId?: string) {
    if (!userId) return false;
    const ids = [
      ...(project.workers || []),
      ...(project.projectAdmins || []),
      project.projectManagerId,
      project.ownerId,
    ].map(String);
    return ids.includes(String(userId));
  }

  private async loadProject(projectId: string, user: AuthUser) {
    const companyId = this.companyOf(user);
    const project = await this.projects.findById(projectId).exec();
    if (!project || String(project.companyId) !== companyId) {
      throw new NotFoundException("Project not found");
    }
    if (!this.isCompanyAdmin(user) && !this.isMember(project, user.userId)) {
      throw new ForbiddenException("You are not a member of this project");
    }
    return project;
  }

  private async loadOrder(id: string, user: AuthUser) {
    const companyId = this.companyOf(user);
    const order = await this.orders.findById(id).exec();
    if (!order || String(order.companyId) !== companyId) {
      throw new NotFoundException("Material order not found");
    }
    const project = await this.loadProject(order.projectId, user);
    return { order, project };
  }

  // Worker edits only own drafts; admins any draft in their scope.
  private assertCanEdit(order: MaterialOrderDocument, user: AuthUser) {
    if (order.status !== MaterialOrderStatus.Draft) {
      throw new BadRequestException("A sent order can no longer be changed");
    }
    if (
      user.role === UserRole.Worker &&
      String(order.createdBy) !== String(user.userId)
    ) {
      throw new ForbiddenException("You can only change your own orders");
    }
  }

  private async resolveRows(rows: MaterialOrderRowDto[], companyId: string) {
    const ids = rows.map((r) => r.articleId).filter(Boolean) as string[];
    const found = ids.length
      ? await this.articles
          .find({ _id: { $in: ids }, companyId })
          .lean()
          .exec()
      : [];
    const byId = new Map(found.map((a) => [String(a._id), a]));
    return rows.map((r) => {
      const a = r.articleId ? byId.get(String(r.articleId)) : undefined;
      if (r.articleId && !a) {
        throw new BadRequestException(`Article "${r.articleId}" not found`);
      }
      const articleNumber = (r.articleNumber ?? a?.articleNumber ?? "").trim();
      const name = (r.name ?? a?.name ?? "").trim();
      if (!articleNumber && !name) {
        throw new BadRequestException(
          "Each row needs an article number or a name",
        );
      }
      return {
        articleId: a ? String(a._id) : null,
        articleNumber,
        name,
        unit: (r.unit ?? a?.unit ?? "st").trim() || "st",
        quantity: Number(r.quantity),
        unitPrice: Number(a?.purchasePriceExclMoms) || 0,
      };
    });
  }

  private parseDate(v?: string): Date | null {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException("Invalid desiredDate");
    }
    return d;
  }

  // Workers never see prices: drop unitPrice from the rows they get back.
  private view(order: MaterialOrderDocument, user: AuthUser) {
    if (user.role !== UserRole.Worker) return order;
    const o = order.toObject();
    o.rows = (o.rows || []).map(({ unitPrice: _p, ...r }) => r);
    return o;
  }

  // ---------- orders ----------

  async findAll(user: AuthUser, projectId?: string) {
    const companyId = this.companyOf(user);
    const filter: Record<string, unknown> = { companyId };
    if (projectId) {
      await this.loadProject(projectId, user);
      filter.projectId = projectId;
    } else if (!this.isCompanyAdmin(user)) {
      const uid = String(user.userId);
      const mine = await this.projects
        .find({
          companyId,
          $or: [
            { workers: uid },
            { projectAdmins: uid },
            { projectManagerId: uid },
            { ownerId: uid },
          ],
        })
        .select("_id")
        .lean()
        .exec();
      filter.projectId = { $in: mine.map((p) => String(p._id)) };
    }
    const list = await this.orders
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .exec();
    return list.map((o) => this.view(o, user));
  }

  async findOne(id: string, user: AuthUser) {
    return this.view((await this.loadOrder(id, user)).order, user);
  }

  async create(dto: CreateMaterialOrderDto, user: AuthUser) {
    const companyId = this.companyOf(user);
    const project = await this.loadProject(dto.projectId, user);
    const rows = await this.resolveRows(dto.rows || [], companyId);
    const last = await this.orders
      .findOne({ companyId })
      .sort({ orderNumber: -1 })
      .select("orderNumber")
      .lean()
      .exec();
    const created = await this.orders.create({
      companyId,
      projectId: String(project._id),
      orderNumber: (last?.orderNumber || 0) + 1,
      supplier: dto.supplier.trim(),
      rows,
      deliveryAddress: (dto.deliveryAddress ?? project.location ?? "").trim(),
      desiredDate: this.parseDate(dto.desiredDate),
      comment: (dto.comment || "").trim(),
      status: MaterialOrderStatus.Draft,
      createdBy: String(user.userId),
    });
    return this.view(created, user);
  }

  async update(id: string, dto: UpdateMaterialOrderDto, user: AuthUser) {
    const { order } = await this.loadOrder(id, user);
    this.assertCanEdit(order, user);
    if (dto.supplier !== undefined) order.supplier = dto.supplier.trim();
    if (dto.rows !== undefined) {
      order.rows = await this.resolveRows(dto.rows, String(order.companyId));
    }
    if (dto.deliveryAddress !== undefined) {
      order.deliveryAddress = dto.deliveryAddress.trim();
    }
    if (dto.desiredDate !== undefined) {
      order.desiredDate = this.parseDate(dto.desiredDate);
    }
    if (dto.comment !== undefined) order.comment = dto.comment.trim();
    return this.view(await order.save(), user);
  }

  async remove(id: string, user: AuthUser) {
    const { order } = await this.loadOrder(id, user);
    this.assertCanEdit(order, user);
    await order.deleteOne();
    return { deleted: true };
  }

  async send(id: string, user: AuthUser) {
    if (user.role === UserRole.Worker) {
      throw new ForbiddenException("Only an admin can send orders");
    }
    const { order, project } = await this.loadOrder(id, user);
    if (order.status !== MaterialOrderStatus.Draft) {
      throw new BadRequestException("Order already sent");
    }
    if (!order.rows.length) {
      throw new BadRequestException("The order has no rows");
    }
    const settings = await this.suppliers
      .findOne({ companyId: order.companyId, supplier: order.supplier })
      .lean()
      .exec();
    if (!settings?.orderEmail) {
      throw new BadRequestException(
        `No order e-mail set for ${order.supplier}`,
      );
    }
    if (!this.sender.isReady()) {
      throw new ServiceUnavailableException(
        "E-mail (SMTP) is not configured — the order was not sent",
      );
    }
    const [company, sender] = await Promise.all([
      this.companies.findById(order.companyId).lean().exec(),
      this.users.findById(user.userId).lean().exec(),
    ]);
    const phone =
      sender?.phoneNumber != null
        ? `${sender.phoneAreaCode ? `+${sender.phoneAreaCode} ` : ""}${sender.phoneNumber}`
        : company?.phone || "";

    await this.sender.send({
      to: settings.orderEmail,
      replyTo: sender?.email || company?.email || undefined,
      rows: order.rows,
      context: {
        orderNumber: order.orderNumber,
        supplier: order.supplier,
        customerNumber: settings.customerNumber,
        companyName: company?.name,
        companyOrgNumber: (company as { orgNumber?: string })?.orgNumber,
        projectName: project.name,
        projectReference: [project.name, project.littera]
          .filter(Boolean)
          .join(" / "),
        deliveryAddress: order.deliveryAddress,
        desiredDate: order.desiredDate
          ? order.desiredDate.toISOString().slice(0, 10)
          : "",
        comment: order.comment,
        orderedByName: sender?.name,
        orderedByEmail: sender?.email,
        orderedByPhone: phone,
      },
    });

    order.status = MaterialOrderStatus.Sent;
    order.sentAt = new Date();
    order.sentBy = String(user.userId);
    order.sentTo = settings.orderEmail;
    order.sentVia = this.sender.channel;
    return order.save();
  }

  // ---------- article picker (workers can't use /articles) ----------

  async searchArticles(user: AuthUser, supplier?: string, q?: string) {
    const companyId = this.companyOf(user);
    const filter: Record<string, unknown> = {
      companyId,
      active: { $ne: false },
    };
    if (supplier) filter.supplier = supplier;
    const term = (q || "").trim();
    if (term) {
      const rx = new RegExp(escapeRegex(term), "i");
      filter.$or = [{ articleNumber: rx }, { name: rx }];
    }
    return this.articles
      .find(filter)
      .select(
        user.role === UserRole.Worker
          ? "articleNumber name unit supplier"
          : "articleNumber name unit supplier purchasePriceExclMoms",
      )
      .sort({ name: 1 })
      .limit(50)
      .lean()
      .exec();
  }

  // ---------- supplier settings ----------

  async listSuppliers(user: AuthUser) {
    const companyId = this.companyOf(user);
    const [settings, fromArticles] = await Promise.all([
      this.suppliers.find({ companyId }).lean().exec(),
      this.articles.distinct("supplier", { companyId }).exec(),
    ]);
    const bySupplier = new Map(settings.map((s) => [s.supplier, s]));
    const names = [
      ...new Set([
        ...settings.map((s) => s.supplier),
        ...(fromArticles as string[]).filter(Boolean),
      ]),
    ].sort((a, b) => a.localeCompare(b, "sv"));
    const admin = user.role !== UserRole.Worker;
    return names.map((supplier) => {
      const s = bySupplier.get(supplier);
      return {
        supplier,
        orderEmail: admin ? s?.orderEmail || "" : undefined,
        customerNumber: admin ? s?.customerNumber || "" : undefined,
        canOrder: !!s?.orderEmail,
      };
    });
  }

  async upsertSupplier(
    supplier: string,
    dto: UpsertMaterialSupplierDto,
    user: AuthUser,
  ) {
    const companyId = this.companyOf(user);
    const name = (supplier || "").trim();
    if (!name) throw new BadRequestException("Supplier is required");
    const set: Record<string, string> = {};
    if (dto.orderEmail !== undefined) set.orderEmail = dto.orderEmail.trim();
    if (dto.customerNumber !== undefined) {
      set.customerNumber = dto.customerNumber.trim();
    }
    return this.suppliers
      .findOneAndUpdate(
        { companyId, supplier: name },
        { $set: set, $setOnInsert: { companyId, supplier: name } },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
  }
}
