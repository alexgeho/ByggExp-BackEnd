import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import exifr from "exifr";
import { readFile } from "fs/promises";
import { join } from "path";
import sharp from "sharp";
import { Company, CompanyDocument } from "../company/schemas/company.schema";
import { launchForInvoicePdf } from "../invoices/puppeteer-launch";
import { Project, ProjectDocument } from "../projects/schemas/project.schema";
import { UserRole } from "../users/schemas/user.schema";
import {
  CreateChecklistDto,
  SignChecklistDto,
  UpdateChecklistDto,
} from "./dto/checklist.dto";
import { toIsoDate } from "./egenkontroll-ai.logic";
import { EgenkontrollAiService } from "./egenkontroll-ai.service";
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
  email?: string;
};

export type PhotoMeta = { takenAt?: string; lat?: number; lng?: number };

export type UploadedPhoto = {
  filename: string;
  originalname: string;
  path: string;
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
    private readonly ai: EgenkontrollAiService,
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
      trade: dto.trade || "",
      tradeInfo: dto.tradeInfo || null,
      items: items || [],
      sourceDocument: dto.sourceDocument || null,
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
    this.syncStatus(doc);
    await doc.save();
    return doc;
  }

  // Auto-complete once every point has an answer.
  private syncStatus(doc: ChecklistDocument) {
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
  }

  // ---- AI egenkontroll ----

  aiStatus() {
    return { enabled: this.ai.enabled };
  }

  draftFromDocument(
    file: { buffer: Buffer; mimetype: string } | null,
    text: string,
  ) {
    return this.ai.draftFromDocument(file, text);
  }

  // Stores site photos (EXIF date/GPS kept) and lets the AI propose results.
  async addPhotos(
    id: string,
    files: UploadedPhoto[],
    user: AuthUser,
    meta: PhotoMeta[] = [],
  ) {
    const doc = await this.findChecklist(id, user);
    if (doc.status === ChecklistStatus.Signed) {
      throw new ForbiddenException("A signed checklist can no longer be edited");
    }
    for (const [i, file] of files.entries()) {
      const exif = await this.readExif(file.path);
      const sent = meta[i] || {};
      const sentDate = sent.takenAt ? new Date(sent.takenAt) : null;
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
      doc.photos.push({
        url: `/uploads/checklist-photos/${file.filename}`,
        name: file.originalname || file.filename,
        takenAt:
          exif.takenAt ||
          (sentDate && !Number.isNaN(sentDate.getTime()) ? sentDate : null),
        lat: exif.lat ?? num(sent.lat),
        lng: exif.lng ?? num(sent.lng),
        uploadedAt: new Date(),
        uploadedByName: user.email || "",
        analyzed: false,
      });
    }
    await doc.save();
    if (this.ai.enabled) await this.runAnalysis(doc, false);
    return doc;
  }

  // Re-runs the AI over every photo (e.g. after editing the points).
  async analyze(id: string, user: AuthUser) {
    const doc = await this.findChecklist(id, user);
    if (doc.status === ChecklistStatus.Signed) return doc;
    await this.runAnalysis(doc, true);
    return doc;
  }

  private async runAnalysis(doc: ChecklistDocument, all: boolean) {
    const photos = doc.photos
      .filter((p) => all || !p.analyzed)
      .slice()
      .reverse()
      .map((p) => ({
        url: p.url,
        date: toIsoDate(p.takenAt) || toIsoDate(p.uploadedAt),
      }));
    if (!photos.length) return;
    const suggestions = await this.ai.suggestFromPhotos(
      doc.items.map((it) => ({
        text: it.text,
        reference: it.reference,
        result: it.result,
        suggestion: it.suggestion,
      })),
      photos,
    );
    // AI fills the point in directly; the user can undo it per point.
    for (const s of suggestions) {
      const item = doc.items[s.index];
      item.suggestion = {
        result: s.result,
        date: s.date,
        photoUrl: s.photoUrl,
        reason: s.reason,
        confidence: s.confidence,
        state: "auto",
      };
      this.applySuggestion(item);
    }
    this.syncStatus(doc);
    const sent = new Set(photos.map((p) => p.url));
    doc.photos.forEach((p) => {
      if (sent.has(p.url)) p.analyzed = true;
    });
    doc.markModified("items");
    doc.markModified("photos");
    await doc.save();
  }

  async decideSuggestion(
    id: string,
    index: number,
    accept: boolean,
    user: AuthUser,
  ) {
    const doc = await this.findChecklist(id, user);
    if (doc.status === ChecklistStatus.Signed) {
      throw new ForbiddenException("A signed checklist can no longer be edited");
    }
    const item = doc.items[index];
    if (!item?.suggestion) throw new NotFoundException("No suggestion");
    const wasApplied = item.suggestion.state === "auto" || item.suggestion.state === "accepted";
    if (accept && !wasApplied) this.applySuggestion(item);
    if (!accept && wasApplied) {
      // Undo what the AI filled in, unless the user has changed it since.
      if (item.result === item.suggestion.result) item.result = ChecklistItemResult.Pending;
      if (item.date === item.suggestion.date) item.date = "";
      item.photoUrls = item.photoUrls.filter((u) => u !== item.suggestion?.photoUrl);
      if (item.comment === item.suggestion.reason) item.comment = "";
    }
    item.suggestion.state = accept ? "accepted" : "rejected";
    doc.markModified("items");
    this.syncStatus(doc);
    await doc.save();
    return doc;
  }

  private applySuggestion(item: ChecklistDocument["items"][number]) {
    const s = item.suggestion;
    if (!s) return;
    item.result = s.result;
    item.date = s.date || toIsoDate(new Date());
    if (s.photoUrl && !item.photoUrls.includes(s.photoUrl)) {
      item.photoUrls.push(s.photoUrl);
    }
    if (!item.comment && s.result !== ChecklistItemResult.Ok) {
      item.comment = s.reason;
    }
  }

  private async readExif(path: string) {
    try {
      const data = await exifr.parse(path, {
        pick: ["DateTimeOriginal", "CreateDate", "latitude", "longitude"],
        gps: true,
      });
      const takenAt = data?.DateTimeOriginal || data?.CreateDate || null;
      return {
        takenAt: takenAt instanceof Date ? takenAt : null,
        lat: typeof data?.latitude === "number" ? data.latitude : null,
        lng: typeof data?.longitude === "number" ? data.longitude : null,
      };
    } catch {
      return { takenAt: null, lat: null, lng: null };
    }
  }

  // Small inline JPEG for the PDF; null when the file is missing/unreadable.
  private async thumbDataUri(url: string): Promise<string | null> {
    try {
      const buf = await readFile(join(process.cwd(), url.replace(/^\//, "")));
      const jpeg = await sharp(buf)
        .rotate()
        .resize({ width: 360, height: 360, fit: "inside" })
        .jpeg({ quality: 70 })
        .toBuffer();
      return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    } catch {
      return null;
    }
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
      trade: doc.trade,
      tradeInfo: doc.tradeInfo,
      items: await Promise.all(
        (doc.items || []).map(async (it) => ({
          text: it.text,
          reference: it.reference,
          result: it.result,
          comment: it.comment,
          date: it.date,
          method: it.method,
          measuredValue: it.measuredValue,
          unit: it.unit,
          checkedByName: it.checkedByName,
          action: it.action,
          actionDoneAt: it.actionDoneAt,
          photos: (
            await Promise.all((it.photoUrls || []).slice(0, 4).map((u) => this.thumbDataUri(u)))
          ).filter((x): x is string => Boolean(x)),
        })),
      ),
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
