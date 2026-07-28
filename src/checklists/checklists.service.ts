import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Company, CompanyDocument } from "../company/schemas/company.schema";
import { launchForInvoicePdf } from "../invoices/puppeteer-launch";
import { Project, ProjectDocument } from "../projects/schemas/project.schema";
import { UserRole } from "../users/schemas/user.schema";
import {
  CreateChecklistDto,
  SignChecklistDto,
  UpdateChecklistDto,
} from "./dto/checklist.dto";
import { CreateTemplateDto, UpdateTemplateDto } from "./dto/template.dto";
import { Checklist, ChecklistDocument } from "./schemas/checklist.schema";
import {
  ChecklistItemResult,
  ChecklistStatus,
} from "./schemas/checklist.enums";
import {
  ChecklistTemplate,
  ChecklistTemplateDocument,
} from "./schemas/checklist-template.schema";
import {
  buildChecklistHtml,
  ChecklistPdfData,
} from "./templates/checklist-pdf.template";

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
  _id?: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  quality: "Kvalitet",
  environment: "Miljö",
  work_environment: "Arbetsmiljö",
  other: "Övrigt",
};

@Injectable()
export class ChecklistsService {
  constructor(
    @InjectModel(ChecklistTemplate.name)
    private templateModel: Model<ChecklistTemplateDocument>,
    @InjectModel(Checklist.name)
    private checklistModel: Model<ChecklistDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
  ) {}

  private companyId(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return user.companyId;
  }

  private userId(user: AuthUser) {
    return String(user.userId || user._id || "") || null;
  }

  // ---- Templates (mallar) ----

  async listTemplates(user: AuthUser) {
    if (!user.companyId) return [];
    return this.templateModel
      .find({ companyId: user.companyId })
      .sort({ name: 1 })
      .exec();
  }

  async createTemplate(dto: CreateTemplateDto, user: AuthUser) {
    const companyId = this.companyId(user);
    const doc = new this.templateModel({
      ...dto,
      companyId,
      items: dto.items || [],
      createdByUserId: this.userId(user),
    });
    return doc.save();
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto, user: AuthUser) {
    const doc = await this.templateModel.findById(id).exec();
    if (!doc) throw new NotFoundException("Template not found");
    this.assertCompany(doc.companyId, user);
    Object.assign(doc, dto, { companyId: doc.companyId });
    await doc.save();
    return doc;
  }

  async removeTemplate(id: string, user: AuthUser) {
    const doc = await this.templateModel.findById(id).exec();
    if (!doc) throw new NotFoundException("Template not found");
    this.assertCompany(doc.companyId, user);
    await this.templateModel.findByIdAndDelete(id).exec();
    return doc;
  }

  // ---- Checklists (egenkontroller) ----

  async listChecklists(user: AuthUser, projectId?: string) {
    if (!user.companyId) return [];
    const filter: Record<string, unknown> = { companyId: user.companyId };
    if (projectId) filter.projectId = projectId;
    return this.checklistModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async createChecklist(dto: CreateChecklistDto, user: AuthUser) {
    const companyId = this.companyId(user);
    let title = dto.title;
    let category = dto.category;
    let items = dto.items;

    // Instantiate from a template when one is given and no items were passed.
    if (dto.templateId && (!items || !items.length)) {
      const template = await this.templateModel.findById(dto.templateId).exec();
      if (template && String(template.companyId) === String(companyId)) {
        title = title || template.name;
        category = category || template.category;
        items = (template.items || []).map((it) => ({
          text: it.text,
          reference: it.reference,
          result: ChecklistItemResult.Pending,
          comment: "",
        }));
      }
    }

    const doc = new this.checklistModel({
      companyId,
      projectId: dto.projectId,
      templateId: dto.templateId || null,
      title: title || "Egenkontroll",
      category: category || undefined,
      date: dto.date || "",
      responsible: dto.responsible || "",
      notes: dto.notes || "",
      items: items || [],
      status: ChecklistStatus.Draft,
      createdByUserId: this.userId(user),
    });
    return doc.save();
  }

  async findChecklist(id: string, user: AuthUser) {
    const doc = await this.checklistModel.findById(id).exec();
    if (!doc) throw new NotFoundException("Checklist not found");
    this.assertCompany(doc.companyId, user);
    return doc;
  }

  async updateChecklist(id: string, dto: UpdateChecklistDto, user: AuthUser) {
    const doc = await this.findChecklist(id, user);
    if (doc.status === ChecklistStatus.Signed) {
      throw new ForbiddenException(
        "A signed checklist can no longer be edited",
      );
    }
    Object.assign(doc, dto, {
      companyId: doc.companyId,
      projectId: doc.projectId,
    });
    // Auto-complete once every point has an answer.
    if (
      doc.items.length &&
      doc.items.every((it) => it.result !== ChecklistItemResult.Pending)
    ) {
      if (doc.status === ChecklistStatus.Draft) {
        doc.status = ChecklistStatus.Completed;
      }
    } else if (doc.status === ChecklistStatus.Completed) {
      doc.status = ChecklistStatus.Draft;
    }
    await doc.save();
    return doc;
  }

  async signChecklist(id: string, dto: SignChecklistDto, user: AuthUser) {
    const doc = await this.findChecklist(id, user);
    doc.status = ChecklistStatus.Signed;
    doc.signedByName = dto.signedByName || doc.signedByName || "";
    doc.signedByUserId = this.userId(user);
    doc.signedAt = new Date();
    await doc.save();
    return doc;
  }

  async removeChecklist(id: string, user: AuthUser) {
    const doc = await this.findChecklist(id, user);
    await this.checklistModel.findByIdAndDelete(id).exec();
    return doc;
  }

  async buildChecklistPdf(id: string, user: AuthUser): Promise<Buffer> {
    const doc = await this.findChecklist(id, user);
    const [company, project] = await Promise.all([
      this.companyModel.findById(doc.companyId).lean(),
      this.projectModel.findById(doc.projectId).lean(),
    ]);

    const data: ChecklistPdfData = {
      companyName: company?.name,
      orgNumber: company?.orgNumber,
      projectName: project?.name,
      title: doc.title,
      categoryLabel: CATEGORY_LABELS[doc.category] || doc.category,
      date: doc.date,
      responsible: doc.responsible,
      notes: doc.notes,
      items: (doc.items || []).map((it) => ({
        text: it.text,
        reference: it.reference,
        result: it.result,
        comment: it.comment,
      })),
      signedByName: doc.signedByName,
      signedAt: doc.signedAt
        ? new Date(doc.signedAt).toISOString().slice(0, 10)
        : "",
    };

    const html = buildChecklistHtml(data);
    const browser = await launchForInvoicePdf();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      return Buffer.from(
        await page.pdf({ format: "A4", printBackground: true }),
      );
    } finally {
      await browser.close();
    }
  }

  private assertCompany(companyId: string, user: AuthUser) {
    if (!user.companyId || String(companyId) !== String(user.companyId)) {
      throw new ForbiddenException("You do not have access to this resource");
    }
  }
}
