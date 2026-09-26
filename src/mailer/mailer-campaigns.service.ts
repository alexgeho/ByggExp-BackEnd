import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { isValidObjectId, Model, Types } from "mongoose";
import { cronsDisabled } from "../common/cron.util";
import {
  renderNewsletterHtml,
  renderNewsletterText,
  UNSUBSCRIBE_PLACEHOLDER,
} from "../newsletters/newsletter-render";
import {
  Newsletter,
  NewsletterDocument,
} from "../newsletters/schemas/newsletter.schema";
import { newToken, verifyLink } from "./mailer-crypto";
import { MailerListsService } from "./mailer-lists.service";
import {
  addTracking,
  applyMergeTags,
  unsubscribeUrlFor,
} from "./mailer-personalize";
import { MailerSettingsService } from "./mailer-settings.service";
import {
  Campaign,
  CampaignDocument,
  CampaignRecipient,
  CampaignRecipientDocument,
  CAMPAIGN_STATUSES,
  EVENT_TYPES,
  MailEvent,
  MailEventDocument,
  MailEventType,
  MailingList,
  MailingListDocument,
} from "./schemas/mailer.schemas";

const apiBase = () =>
  (process.env.API_PUBLIC_URL || "https://api.byggexp.se").replace(/\/+$/, "");

const oid = (id: string) => {
  if (!isValidObjectId(id)) throw new NotFoundException("Not found");
  return new Types.ObjectId(id);
};

type CampaignInput = {
  name?: string;
  newsletterId?: string | null;
  listId?: string | null;
  subject?: string;
};

// SMTP errors that mean "this account/connection is broken" rather than "this
// one address is bad" — sending pauses instead of burning through the list.
const FATAL_CODES = new Set([
  "EAUTH",
  "ECONNECTION",
  "ETIMEDOUT",
  "ESOCKET",
  "EDNS",
  "ECONNREFUSED",
]);

@Injectable()
export class MailerCampaignsService {
  private readonly logger = new Logger(MailerCampaignsService.name);
  private running = false;

  constructor(
    @InjectModel(Campaign.name)
    private readonly campaigns: Model<CampaignDocument>,
    @InjectModel(CampaignRecipient.name)
    private readonly recipients: Model<CampaignRecipientDocument>,
    @InjectModel(MailEvent.name)
    private readonly events: Model<MailEventDocument>,
    @InjectModel(MailingList.name)
    private readonly lists: Model<MailingListDocument>,
    @InjectModel(Newsletter.name)
    private readonly newsletters: Model<NewsletterDocument>,
    private readonly listsService: MailerListsService,
    private readonly settings: MailerSettingsService,
  ) {}

  // ---------- CRUD ----------

  async list(status?: string) {
    const filter =
      status && (CAMPAIGN_STATUSES as readonly string[]).includes(status)
        ? { status }
        : {};
    const items = await this.campaigns
      .find(filter, { snapshot: 0 })
      .sort({ createdAt: -1 })
      .lean();
    const [lists, nls] = await Promise.all([
      this.lists.find({}, { name: 1 }).lean(),
      this.newsletters.find({}, { title: 1 }).lean(),
    ]);
    const listName = new Map(lists.map((l) => [String(l._id), l.name]));
    const nlTitle = new Map(nls.map((n) => [String(n._id), n.title]));
    return items.map((c) => ({
      ...c,
      listName: c.listId ? listName.get(String(c.listId)) || "" : "",
      newsletterTitle: c.newsletterId
        ? nlTitle.get(String(c.newsletterId)) || ""
        : "",
    }));
  }

  async counts() {
    const rows = await this.campaigns.aggregate<{ _id: string; n: number }>([
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((r) => [r._id, r.n]));
  }

  async get(id: string) {
    const c = await this.campaigns.findById(oid(id), { snapshot: 0 }).lean();
    if (!c) throw new NotFoundException("Campaign not found");
    return c;
  }

  private async resolveRefs(input: CampaignInput) {
    const set: Record<string, unknown> = {};
    if (input.name !== undefined)
      set.name = String(input.name).trim().slice(0, 200) || "Kampanj";
    if (input.subject !== undefined)
      set.subject = String(input.subject).slice(0, 300);
    if (input.newsletterId !== undefined) {
      set.newsletterId = input.newsletterId ? oid(input.newsletterId) : null;
      if (input.newsletterId && input.subject === undefined) {
        const nl = await this.newsletters
          .findById(input.newsletterId, { subject: 1 })
          .lean();
        if (nl?.subject) set.subject = nl.subject;
      }
    }
    if (input.listId !== undefined)
      set.listId = input.listId ? oid(input.listId) : null;
    return set;
  }

  async create(input: CampaignInput) {
    const set = await this.resolveRefs({
      name: input.name || "Ny kampanj",
      ...input,
    });
    return this.campaigns.create(set);
  }

  async update(id: string, input: CampaignInput) {
    const c = await this.get(id);
    if (!["draft", "scheduled", "paused"].includes(c.status)) {
      throw new BadRequestException(
        "Kampanjen kan inte ändras när den skickas eller är klar",
      );
    }
    const set = await this.resolveRefs(input);
    if (c.status === "paused") {
      // Content/list are frozen once sending started; only name/subject change.
      delete set.newsletterId;
      delete set.listId;
    }
    return this.campaigns
      .findByIdAndUpdate(id, set, { new: true, projection: { snapshot: 0 } })
      .lean();
  }

  async remove(id: string) {
    const c = await this.get(id);
    if (c.status === "sending")
      throw new BadRequestException("Pausa kampanjen först");
    await this.recipients.deleteMany({ campaignId: c._id });
    await this.campaigns.deleteOne({ _id: c._id });
    return { deleted: true };
  }

  async duplicate(id: string) {
    const c = await this.get(id);
    return this.campaigns.create({
      name: `${c.name} (kopia)`,
      newsletterId: c.newsletterId,
      listId: c.listId,
      subject: c.subject,
    });
  }

  // ---------- lifecycle ----------

  // Send now, or schedule for later. Recipients are resolved when sending
  // actually begins, so late imports and fresh unsubscribes are respected.
  async start(id: string, scheduledAt?: string | null) {
    const c = await this.get(id);
    if (!["draft", "scheduled"].includes(c.status))
      throw new BadRequestException("Kampanjen är redan startad");
    if (!c.newsletterId)
      throw new BadRequestException("Välj ett nyhetsbrev (design)");
    if (!c.listId) throw new BadRequestException("Välj en prenumerationslista");
    if (!c.subject.trim()) throw new BadRequestException("Ämnesrad saknas");
    await this.settings.transport(); // throws if SMTP isn't configured

    const when = scheduledAt ? new Date(scheduledAt) : null;
    if (when && Number.isNaN(when.getTime()))
      throw new BadRequestException("Ogiltigt datum");
    if (when && when.getTime() > Date.now() + 60_000) {
      await this.campaigns.updateOne(
        { _id: c._id },
        { status: "scheduled", scheduledAt: when },
      );
      return this.get(id);
    }
    await this.beginSending(c._id);
    return this.get(id);
  }

  private async beginSending(campaignId: Types.ObjectId) {
    const c = await this.campaigns.findById(campaignId);
    if (!c || !c.newsletterId || !c.listId) return;
    const nl = await this.newsletters.findById(c.newsletterId).lean();
    if (!nl) {
      await this.campaigns.updateOne(
        { _id: c._id },
        { status: "paused", lastError: "Nyhetsbrevet finns inte längre" },
      );
      return;
    }
    const subs = await this.listsService.activeSubscribers(String(c.listId));
    const suppressed = await this.listsService.suppressedSet(
      subs.map((s) => s.email),
    );
    const docs = subs
      .filter((s) => !suppressed.has(s.email))
      .map((s) => ({
        campaignId: c._id,
        subscriberId: s._id,
        email: s.email,
        name: s.name,
        company: s.company,
        token: newToken(),
      }));
    if (!docs.length) {
      await this.campaigns.updateOne(
        { _id: c._id },
        { status: "paused", lastError: "Inga aktiva mottagare i listan" },
      );
      return;
    }
    await this.recipients.deleteMany({ campaignId: c._id, status: "queued" });
    await this.recipients.insertMany(docs, { ordered: false });
    await this.campaigns.updateOne(
      { _id: c._id },
      {
        status: "sending",
        startedAt: new Date(),
        lastError: "",
        snapshot: { settings: nl.settings, blocks: nl.blocks },
        "stats.total": docs.length,
      },
    );
  }

  async pause(id: string) {
    const c = await this.get(id);
    if (!["sending", "scheduled"].includes(c.status))
      throw new BadRequestException("Kampanjen skickas inte");
    await this.campaigns.updateOne(
      { _id: c._id },
      { status: c.status === "scheduled" ? "draft" : "paused" },
    );
    return this.get(id);
  }

  async resume(id: string) {
    const c = await this.get(id);
    if (c.status !== "paused")
      throw new BadRequestException("Kampanjen är inte pausad");
    await this.settings.transport();
    const hasQueue = await this.recipients.exists({
      campaignId: c._id,
      status: { $in: ["queued", "sending"] },
    });
    if (hasQueue)
      await this.campaigns.updateOne(
        { _id: c._id },
        { status: "sending", lastError: "" },
      );
    else await this.beginSending(c._id); // paused before any recipients were created
    return this.get(id);
  }

  async cancel(id: string) {
    const c = await this.get(id);
    if (["completed", "cancelled"].includes(c.status))
      throw new BadRequestException("Kampanjen är redan avslutad");
    await this.campaigns.updateOne(
      { _id: c._id },
      { status: "cancelled", completedAt: new Date() },
    );
    return this.get(id);
  }

  // ---------- rendering ----------

  private renderBase(
    snapshot: { settings: unknown; blocks: unknown },
    subject: string,
  ) {
    return {
      html: renderNewsletterHtml(snapshot.settings, snapshot.blocks, {
        subject,
      }),
      text: renderNewsletterText(snapshot.settings, snapshot.blocks, {
        subject,
      }),
    };
  }

  private personalize(
    base: { html: string; text: string },
    subject: string,
    r: { email: string; name: string; company: string; token: string },
    tracking: { trackOpens: boolean; trackClicks: boolean } | null,
  ) {
    const unsub = unsubscribeUrlFor(apiBase(), r.token);
    let html = applyMergeTags(
      base.html.split(UNSUBSCRIBE_PLACEHOLDER).join(unsub),
      r,
      true,
    );
    if (tracking)
      html = addTracking(html, {
        apiBase: apiBase(),
        token: r.token,
        ...tracking,
      });
    return {
      html,
      text: applyMergeTags(
        base.text.split(UNSUBSCRIBE_PLACEHOLDER).join(unsub),
        r,
        false,
      ),
      subject: applyMergeTags(subject, r, false),
      unsub,
    };
  }

  async sendTest(id: string, to: string) {
    const c = await this.campaigns.findById(oid(id)).lean();
    if (!c) throw new NotFoundException("Campaign not found");
    const nl =
      c.snapshot ??
      (c.newsletterId
        ? await this.newsletters.findById(c.newsletterId).lean()
        : null);
    if (!nl) throw new BadRequestException("Välj ett nyhetsbrev (design)");
    const { transporter, from, settings } = await this.settings.transport();
    const base = this.renderBase(
      { settings: nl.settings, blocks: nl.blocks },
      c.subject,
    );
    const msg = this.personalize(
      base,
      c.subject,
      { email: to, name: "Test", company: "Testföretag AB", token: "test" },
      null,
    );
    await transporter.sendMail({
      from,
      to,
      replyTo: settings.replyTo || undefined,
      subject: `[TEST] ${msg.subject}`,
      html: msg.html,
      text: msg.text,
    });
    return { sent: true, to };
  }

  // ---------- sender ----------

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (cronsDisabled() || this.running) return;
    this.running = true;
    try {
      await this.processQueue();
    } catch (err) {
      this.logger.error("Mailer tick failed", err);
    } finally {
      this.running = false;
    }
  }

  async processQueue() {
    const due = await this.campaigns
      .find(
        { status: "scheduled", scheduledAt: { $lte: new Date() } },
        { _id: 1 },
      )
      .lean();
    for (const d of due) await this.beginSending(d._id);

    const active = await this.campaigns
      .find({ status: "sending" })
      .sort({ startedAt: 1 });
    if (!active.length) return;

    let transport: Awaited<ReturnType<MailerSettingsService["transport"]>>;
    try {
      transport = await this.settings.transport();
    } catch (err) {
      await this.campaigns.updateMany(
        { status: "sending" },
        {
          status: "paused",
          lastError: err instanceof Error ? err.message : String(err),
        },
      );
      return;
    }
    // Per-minute budget shared by all running campaigns.
    let budget = Math.max(1, Math.ceil(transport.settings.ratePerHour / 60));

    for (const c of active) {
      // Recover recipients left mid-send by a crash/restart.
      await this.recipients.updateMany(
        {
          campaignId: c._id,
          status: "sending",
          updatedAt: { $lt: new Date(Date.now() - 10 * 60_000) },
        },
        { status: "queued" },
      );
      const base = this.renderBase(
        c.snapshot ?? { settings: {}, blocks: [] },
        c.subject,
      );
      while (budget > 0) {
        const r = await this.recipients.findOneAndUpdate(
          { campaignId: c._id, status: "queued" },
          { status: "sending", $inc: { attempts: 1 } },
          { new: true, sort: { _id: 1 } },
        );
        if (!r) break;
        budget--;
        const stop = await this.sendOne(c, r, base, transport);
        if (stop) return;
      }
      const left = await this.recipients.exists({
        campaignId: c._id,
        status: { $in: ["queued", "sending"] },
      });
      if (!left) {
        await this.campaigns.updateOne(
          { _id: c._id, status: "sending" },
          { status: "completed", completedAt: new Date() },
        );
      }
      if (budget <= 0) break;
    }
  }

  // Returns true when sending must stop (account-level SMTP failure).
  private async sendOne(
    c: CampaignDocument,
    r: CampaignRecipientDocument,
    base: { html: string; text: string },
    t: Awaited<ReturnType<MailerSettingsService["transport"]>>,
  ): Promise<boolean> {
    const msg = this.personalize(base, c.subject, r, {
      trackOpens: t.settings.trackOpens,
      trackClicks: t.settings.trackClicks,
    });
    const mailto = t.settings.replyTo || t.settings.fromEmail;
    try {
      await t.transporter.sendMail({
        from: t.from,
        to: r.name
          ? { name: r.name.replace(/["\r\n]/g, ""), address: r.email }
          : r.email,
        replyTo: t.settings.replyTo || undefined,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        headers: {
          // RFC 8058 one-click unsubscribe — required by Gmail/Yahoo for bulk mail.
          "List-Unsubscribe": `<${msg.unsub}>, <mailto:${mailto}?subject=unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          "X-Campaign": String(c._id),
        },
      });
      await this.recipients.updateOne(
        { _id: r._id },
        { status: "sent", sentAt: new Date(), error: "" },
      );
      await this.campaigns.updateOne(
        { _id: c._id },
        { $inc: { "stats.sent": 1 } },
      );
      if (r.subscriberId) await this.listsService.markSent([r.subscriberId]);
      await this.log("sent", c._id, r.email);
      return false;
    } catch (err) {
      const e = err as {
        responseCode?: number;
        code?: string;
        message?: string;
      };
      const message = String(e.message || err).slice(0, 300);
      if (e.code && FATAL_CODES.has(e.code) && !e.responseCode) {
        await this.recipients.updateOne(
          { _id: r._id },
          { status: "queued", error: message },
        );
        await this.campaigns.updateOne(
          { _id: c._id },
          { status: "paused", lastError: `SMTP: ${message}` },
        );
        return true;
      }
      if (e.responseCode && e.responseCode >= 500) {
        // Hard bounce: the address doesn't exist — never mail it again.
        await this.recipients.updateOne(
          { _id: r._id },
          { status: "failed", error: message },
        );
        await this.campaigns.updateOne(
          { _id: c._id },
          { $inc: { "stats.failed": 1, "stats.bounced": 1 } },
        );
        await this.listsService.markEverywhere(r.email, "bounced");
        await this.log("bounce", c._id, r.email, message);
        return false;
      }
      if (r.attempts >= 3) {
        await this.recipients.updateOne(
          { _id: r._id },
          { status: "failed", error: message },
        );
        await this.campaigns.updateOne(
          { _id: c._id },
          { $inc: { "stats.failed": 1 } },
        );
        await this.log("failed", c._id, r.email, message);
      } else {
        await this.recipients.updateOne(
          { _id: r._id },
          { status: "queued", error: message },
        );
      }
      return false;
    }
  }

  // ---------- tracking (public endpoints) ----------

  private log(
    type: MailEventType,
    campaignId: Types.ObjectId | null,
    email: string,
    detail = "",
  ) {
    return this.events.create({
      type,
      campaignId,
      email,
      detail: detail.slice(0, 500),
    });
  }

  private byToken(token: string) {
    if (!/^[a-f0-9]{32}$/.test(token)) return null;
    return this.recipients.findOne({ token });
  }

  // Sets `field` only if it is still empty; true when this call set it.
  // Atomic, so parallel hits (mail scanners fetch links several times at
  // once) never count the same recipient twice.
  private async markFirst(
    id: Types.ObjectId,
    field: "openedAt" | "clickedAt",
  ): Promise<boolean> {
    const res = await this.recipients.updateOne(
      { _id: id, [field]: null },
      { $set: { [field]: new Date() } },
    );
    return res.modifiedCount === 1;
  }

  async trackOpen(token: string) {
    const r = await this.byToken(token);
    if (!r) return;
    await this.recipients.updateOne({ _id: r._id }, { $inc: { opens: 1 } });
    if (await this.markFirst(r._id, "openedAt")) {
      await this.campaigns.updateOne(
        { _id: r.campaignId },
        { $inc: { "stats.opened": 1 } },
      );
      await this.log("open", r.campaignId, r.email);
    }
  }

  // Returns the destination if the signature is valid.
  async trackClick(
    token: string,
    url: string,
    sig: string,
  ): Promise<string | null> {
    if (!/^https?:\/\//i.test(url) || !verifyLink(token, url, sig)) return null;
    const r = await this.byToken(token);
    if (!r) return url;
    await this.recipients.updateOne({ _id: r._id }, { $inc: { clicks: 1 } });
    const firstClick = await this.markFirst(r._id, "clickedAt");
    // Clicked with images off → count as opened too.
    const firstOpen = await this.markFirst(r._id, "openedAt");
    const inc: Record<string, number> = {};
    if (firstClick) inc["stats.clicked"] = 1;
    if (firstOpen) inc["stats.opened"] = 1;
    if (Object.keys(inc).length)
      await this.campaigns.updateOne({ _id: r.campaignId }, { $inc: inc });
    // One log row per recipient and link: repeat hits (Outlook Safe Links,
    // double clicks) only bump the counter above.
    const seen = await this.events.exists({
      type: "click",
      campaignId: r.campaignId,
      email: r.email,
      detail: url.slice(0, 500),
    });
    if (!seen) await this.log("click", r.campaignId, r.email, url);
    return url;
  }

  async unsubscribe(token: string): Promise<{ ok: boolean; email?: string }> {
    const r = await this.byToken(token);
    if (!r) return { ok: false };
    const already = await this.listsService.isSuppressed(r.email);
    await this.listsService.markEverywhere(r.email, "unsubscribed");
    if (!already) {
      await this.campaigns.updateOne(
        { _id: r.campaignId },
        { $inc: { "stats.unsubscribed": 1 } },
      );
      await this.log("unsubscribe", r.campaignId, r.email);
    }
    return { ok: true, email: r.email };
  }

  // ---------- log ----------

  async listEvents(q: {
    campaignId?: string;
    type?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const filter: Record<string, unknown> = {};
    if (q.campaignId) filter.campaignId = oid(q.campaignId);
    if (q.type && (EVENT_TYPES as readonly string[]).includes(q.type))
      filter.type = q.type;
    if (q.search)
      filter.email = new RegExp(
        String(q.search)
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          .slice(0, 100),
        "i",
      );
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
    const page = Math.max(1, Number(q.page) || 1);
    const [items, total, camps] = await Promise.all([
      this.events
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.events.countDocuments(filter),
      this.campaigns.find({}, { name: 1 }).lean(),
    ]);
    const name = new Map(camps.map((c) => [String(c._id), c.name]));
    return {
      items: items.map((e) => ({
        ...e,
        campaignName: e.campaignId ? name.get(String(e.campaignId)) || "" : "",
      })),
      total,
      page,
      limit,
    };
  }
}
