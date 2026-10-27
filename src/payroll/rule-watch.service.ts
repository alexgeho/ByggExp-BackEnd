import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { cronsDisabled } from "../common/cron.util";
import { MailService } from "../mail/mail.service";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import {
  RULE_SOURCE_AREAS,
  RuleSource,
  RuleSourceArea,
  RuleSourceDocument,
} from "./schemas/rule-source.schema";
import {
  DEFAULT_RULE_SOURCES,
  excerpt,
  textHash,
  visibleText,
} from "./rule-watch.util";

// Regelbevakning: watches the pages pay rules come from and tells superadmins
// when one changes. Nothing is changed automatically — a human reviews the
// change and publishes a new agreement version when needed.
@Injectable()
export class RuleWatchService implements OnModuleInit {
  private readonly logger = new Logger(RuleWatchService.name);
  private running = false;

  constructor(
    @InjectModel(RuleSource.name)
    private sourceModel: Model<RuleSourceDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly mailService: MailService,
  ) {}

  // Seeds the default watch list once; existing sources are never overwritten.
  async onModuleInit(): Promise<void> {
    try {
      for (const source of DEFAULT_RULE_SOURCES) {
        await this.sourceModel
          .updateOne(
            { key: source.key },
            { $setOnInsert: { ...source, enabled: true } },
            { upsert: true },
          )
          .exec();
      }
    } catch (error) {
      this.logger.warn(`Could not seed rule sources: ${String(error)}`);
    }
  }

  async list() {
    return this.sourceModel.find().sort({ area: 1, name: 1 }).lean().exec();
  }

  async add(dto: { name: string; url: string; area?: string }) {
    if (!dto?.name?.trim() || !/^https:\/\//i.test(dto?.url || "")) {
      throw new BadRequestException("name and an https url are required");
    }
    const area = (RULE_SOURCE_AREAS as readonly string[]).includes(
      dto.area || "",
    )
      ? (dto.area as RuleSourceArea)
      : "agreement";
    const source = await new this.sourceModel({
      key: `custom-${Date.now()}`,
      name: dto.name.trim(),
      url: dto.url.trim(),
      area,
    }).save();
    // First check sets the baseline; it is not reported as a change.
    await this.check(source);
    return source;
  }

  async update(
    id: string,
    dto: { name?: string; url?: string; enabled?: boolean },
  ) {
    const source = await this.get(id);
    if (dto.name != null) source.name = String(dto.name).trim();
    if (dto.url != null) {
      if (!/^https:\/\//i.test(dto.url)) {
        throw new BadRequestException("url must be https");
      }
      source.url = dto.url.trim();
      source.lastHash = ""; // new page → new baseline
    }
    if (dto.enabled != null) source.enabled = Boolean(dto.enabled);
    await source.save();
    return source;
  }

  async remove(id: string) {
    const source = await this.get(id);
    await source.deleteOne();
  }

  async markReviewed(id: string, userId?: string) {
    const source = await this.get(id);
    source.needsReview = false;
    source.reviewedAt = new Date();
    source.reviewedByUserId = userId || null;
    await source.save();
    return source;
  }

  async checkOne(id: string) {
    const source = await this.get(id);
    await this.check(source);
    return source;
  }

  // Weekly, Monday 05:15: re-read every enabled source.
  @Cron("15 5 * * 1")
  async checkAll(): Promise<{ checked: number; changed: number }> {
    if (cronsDisabled() || this.running) return { checked: 0, changed: 0 };
    this.running = true;
    try {
      const sources = await this.sourceModel.find({ enabled: true }).exec();
      const changed: RuleSourceDocument[] = [];
      for (const source of sources) {
        if (await this.check(source)) changed.push(source);
      }
      if (changed.length) {
        await this.alertSuperadmins(
          `Regelkällor har ändrats (${changed.length})`,
          [
            "Följande sidor har ändrats sedan förra kontrollen. Granska dem och publicera en ny avtalsversion om beloppen ändrats:",
            ...changed.map((s) => `• ${s.name}: ${s.url}`),
          ].join("\n"),
        );
      }
      return { checked: sources.length, changed: changed.length };
    } finally {
      this.running = false;
    }
  }

  // Returns true when the page changed since the previous check.
  private async check(source: RuleSourceDocument): Promise<boolean> {
    source.lastCheckedAt = new Date();
    try {
      const res = await fetch(source.url, {
        headers: { "User-Agent": "ByggExp regelbevakning" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get("content-type") || "";
      const text = type.includes("html")
        ? visibleText(await res.text())
        : // PDFs and other files: hash the bytes.
          Buffer.from(await res.arrayBuffer()).toString("base64");
      const hash = textHash(text);
      const changed = Boolean(source.lastHash) && source.lastHash !== hash;
      if (changed) {
        source.lastChangedAt = new Date();
        source.needsReview = true;
      }
      source.lastHash = hash;
      source.lastExcerpt = type.includes("html") ? excerpt(text) : "";
      source.lastError = "";
      await source.save();
      return changed;
    } catch (error) {
      source.lastError = String((error as Error)?.message || error);
      await source.save();
      this.logger.warn(`Rule source ${source.key} failed: ${source.lastError}`);
      return false;
    }
  }

  private async get(id: string): Promise<RuleSourceDocument> {
    const source = await this.sourceModel.findById(id).exec();
    if (!source) throw new NotFoundException("Rule source not found");
    return source;
  }

  // E-mails every superadmin; failures are logged, never thrown.
  async alertSuperadmins(subject: string, body: string): Promise<void> {
    const admins = await this.userModel
      .find({ role: UserRole.SuperAdmin, erasedAt: null })
      .select("email")
      .lean()
      .exec();
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    for (const admin of admins) {
      if (!admin.email) continue;
      try {
        await this.mailService.sendHtmlEmail({
          to: String(admin.email),
          subject: `ByggExp lön: ${subject}`,
          text: body,
          html: `<p>${esc(body).replace(/\n/g, "<br>")}</p>`,
        });
      } catch (error) {
        this.logger.warn(
          `Alert e-mail to ${admin.email} failed: ${String(error)}`,
        );
      }
    }
  }
}
