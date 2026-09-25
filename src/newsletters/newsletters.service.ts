import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { isValidObjectId, Model } from "mongoose";
import { MailService } from "../mail/mail.service";
import {
  normalizeBlocks,
  normalizeSettings,
  renderNewsletterHtml,
  renderNewsletterText,
} from "./newsletter-render";
import { defaultNewsletterTemplate } from "./newsletter-template";
import { Newsletter, NewsletterDocument } from "./schemas/newsletter.schema";

export type NewsletterContent = {
  title?: string;
  subject?: string;
  settings?: unknown;
  blocks?: unknown;
};

@Injectable()
export class NewslettersService {
  constructor(
    @InjectModel(Newsletter.name)
    private readonly model: Model<NewsletterDocument>,
    private readonly mailService: MailService,
  ) {}

  list() {
    return this.model
      .find({}, { title: 1, subject: 1, updatedAt: 1, createdAt: 1 })
      .sort({ updatedAt: -1 })
      .lean();
  }

  async get(id: string) {
    const doc = isValidObjectId(id)
      ? await this.model.findById(id).lean()
      : null;
    if (!doc) throw new NotFoundException("Newsletter not found");
    return doc;
  }

  // New drafts start from the default template unless `blank` is requested.
  create(title: string, blank: boolean, userId: string | null) {
    const tpl = defaultNewsletterTemplate();
    return this.model.create({
      title: title || tpl.subject,
      subject: blank ? "" : tpl.subject,
      settings: blank ? normalizeSettings({}) : tpl.settings,
      blocks: blank ? [] : tpl.blocks,
      updatedBy: userId,
    });
  }

  async update(id: string, dto: NewsletterContent, userId: string | null) {
    await this.get(id);
    const patch: Record<string, unknown> = { updatedBy: userId };
    if (dto.title !== undefined)
      patch.title = String(dto.title).slice(0, 200) || "Utan titel";
    if (dto.subject !== undefined)
      patch.subject = String(dto.subject).slice(0, 300);
    if (dto.settings !== undefined)
      patch.settings = normalizeSettings(dto.settings);
    if (dto.blocks !== undefined) patch.blocks = normalizeBlocks(dto.blocks);
    return this.model.findByIdAndUpdate(id, patch, { new: true }).lean();
  }

  async duplicate(id: string, userId: string | null) {
    const src = await this.get(id);
    return this.model.create({
      title: `${src.title} (kopia)`,
      subject: src.subject,
      settings: src.settings,
      blocks: src.blocks,
      updatedBy: userId,
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.model.deleteOne({ _id: id });
    return { deleted: true };
  }

  render(content: NewsletterContent) {
    const opts = { subject: content.subject || "" };
    return {
      html: renderNewsletterHtml(content.settings, content.blocks, opts),
      text: renderNewsletterText(content.settings, content.blocks, opts),
    };
  }

  async renderStored(id: string) {
    const doc = await this.get(id);
    return { doc, ...this.render(doc) };
  }

  async sendTest(id: string, to: string) {
    const { doc, html, text } = await this.renderStored(id);
    const subject = `[TEST] ${doc.subject || doc.title}`;
    await this.mailService.sendHtmlEmail({ to, subject, html, text });
    return { sent: true, to };
  }
}
