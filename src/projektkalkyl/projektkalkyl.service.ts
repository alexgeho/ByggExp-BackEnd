import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Subject } from "rxjs";
import { randomBytes } from "crypto";
import { launchForInvoicePdf } from "../invoices/puppeteer-launch";
import { buildProjektkalkylHtml } from "./projektkalkyl-pdf.template";
import { UserRole } from "../users/schemas/user.schema";
import {
  Projektkalkyl,
  ProjektkalkylDocument,
} from "./schemas/projektkalkyl.schema";
import {
  CreateProjektkalkylDto,
  UpdateProjektkalkylDto,
} from "./dto/projektkalkyl.dto";

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
};

@Injectable()
export class ProjektkalkylService {
  constructor(
    @InjectModel(Projektkalkyl.name)
    private model: Model<ProjektkalkylDocument>,
  ) {}

  // In-memory change bus (single PM2 instance): emits a calc id after any save
  // so SSE viewers get an instant push. Falls back to client polling otherwise.
  readonly changes$ = new Subject<string>();

  private emitChange(id: unknown): void {
    this.changes$.next(String(id));
  }

  async resolveShareId(token: string): Promise<string> {
    const clean = (token || "").trim();
    const doc = await this.model.findOne({ shareToken: clean }).select("_id shareExpiresAt").lean().exec();
    if (!doc || !doc.shareExpiresAt || new Date(doc.shareExpiresAt) < new Date()) {
      throw new NotFoundException("This link has expired or is invalid");
    }
    return String(doc._id);
  }

  private companyOf(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return user.companyId;
  }

  async findAccessible(user: AuthUser): Promise<Projektkalkyl[]> {
    if (!user.companyId) return [];
    return this.model
      .find({ companyId: user.companyId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string, user: AuthUser): Promise<ProjektkalkylDocument> {
    const doc = await this.model.findById(id).exec();
    if (!doc) {
      throw new NotFoundException(`Projektkalkyl "${id}" not found`);
    }
    if (!user.companyId || String(doc.companyId) !== String(user.companyId)) {
      throw new ForbiddenException("You do not have access to this calculation");
    }
    return doc;
  }

  async create(
    dto: CreateProjektkalkylDto,
    user: AuthUser,
  ): Promise<Projektkalkyl> {
    const doc = new this.model({
      ...dto,
      name: dto.name || "Ny kalkyl",
      tables: dto.tables || [],
      companyId: this.companyOf(user),
      createdByUserId: user.userId,
    });
    return doc.save();
  }

  async update(
    id: string,
    dto: UpdateProjektkalkylDto,
    user: AuthUser,
  ): Promise<ProjektkalkylDocument> {
    const doc = await this.findOne(id, user);
    Object.assign(doc, {
      ...dto,
      companyId: doc.companyId,
      createdByUserId: doc.createdByUserId,
    });
    // tables is a Mixed ([Object]) field — Mongoose can't detect deep mutations,
    // so flag it dirty explicitly or the board layout won't persist.
    if (dto.tables !== undefined) doc.markModified("tables");
    const saved = await doc.save();
    this.emitChange(id);
    return saved;
  }

  private static readonly SHARE_TTL_MS = 60 * 60 * 1000; // 1 hour

  async createShareLink(
    id: string,
    user: AuthUser,
  ): Promise<{ token: string; expiresAt: Date }> {
    const doc = await this.findOne(id, user);
    doc.shareToken = randomBytes(24).toString("hex");
    doc.shareExpiresAt = new Date(
      Date.now() + ProjektkalkylService.SHARE_TTL_MS,
    );
    await doc.save();
    return { token: doc.shareToken, expiresAt: doc.shareExpiresAt };
  }

  async revokeShareLink(id: string, user: AuthUser): Promise<void> {
    const doc = await this.findOne(id, user);
    doc.shareToken = "";
    doc.shareExpiresAt = null;
    await doc.save();
  }

  // Public (no auth): resolve a share token to a read-only snapshot. Returns
  // only presentational fields — never companyId / owner / internal ids.
  async findByShareToken(token: string): Promise<{
    name: string;
    note?: string;
    tables: Record<string, unknown>[];
    comments: Record<string, unknown>[];
    expiresAt: Date;
  }> {
    const clean = (token || "").trim();
    if (!clean) throw new NotFoundException("Link not found");
    const doc = await this.model.findOne({ shareToken: clean }).lean().exec();
    if (!doc || !doc.shareExpiresAt || new Date(doc.shareExpiresAt) < new Date()) {
      throw new NotFoundException("This link has expired or is invalid");
    }
    return {
      name: doc.name,
      note: doc.note,
      tables: doc.tables || [],
      comments: doc.comments || [],
      expiresAt: doc.shareExpiresAt,
    };
  }

  private buildComment(authorName: string | undefined, text: string | undefined, guest: boolean) {
    return {
      id: randomBytes(8).toString("hex"),
      authorName: (authorName || (guest ? "Gäst" : "")).slice(0, 80),
      text: (text || "").slice(0, 2000),
      guest,
      createdAt: new Date().toISOString(),
    };
  }

  async addComment(
    id: string,
    user: AuthUser,
    authorName?: string,
    text?: string,
  ): Promise<Record<string, unknown>[]> {
    if (!text?.trim()) throw new ForbiddenException("Empty comment");
    const doc = await this.findOne(id, user);
    doc.comments = [...(doc.comments || []), this.buildComment(authorName, text, false)];
    doc.markModified("comments");
    await doc.save();
    this.emitChange(id);
    return doc.comments;
  }

  // Public guest comment via an unexpired share token.
  async addGuestComment(
    token: string,
    authorName?: string,
    text?: string,
  ): Promise<Record<string, unknown>[]> {
    if (!text?.trim()) throw new ForbiddenException("Empty comment");
    const clean = (token || "").trim();
    const doc = await this.model.findOne({ shareToken: clean }).exec();
    if (!doc || !doc.shareExpiresAt || new Date(doc.shareExpiresAt) < new Date()) {
      throw new NotFoundException("This link has expired or is invalid");
    }
    doc.comments = [...(doc.comments || []), this.buildComment(authorName, text, true)];
    doc.markModified("comments");
    await doc.save();
    this.emitChange(doc._id);
    return doc.comments;
  }

  async buildPdf(id: string, user: AuthUser): Promise<Buffer> {
    const doc = await this.findOne(id, user);
    const html = buildProjektkalkylHtml(doc);
    const browser = await launchForInvoicePdf();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const buf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" },
      });
      return Buffer.from(buf);
    } finally {
      await browser.close();
    }
  }

  async remove(id: string, user: AuthUser): Promise<Projektkalkyl> {
    const doc = await this.findOne(id, user);
    await this.model.findByIdAndDelete(id).exec();
    return doc;
  }
}
