import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ImapFlow } from "imapflow";
import { MailService } from "../mail/mail.service";
import { escapeHtml } from "../newsletters/newsletter-render";
import { simpleParser } from "mailparser";
import { isValidObjectId, Model, Types } from "mongoose";
import {
  callClaude,
  claudeEnabled,
  parseJsonObject,
} from "../common/anthropic.client";
import { cronsDisabled } from "../common/cron.util";
import { Company, CompanyDocument } from "../company/schemas/company.schema";
import { DemoLead, DemoLeadDocument } from "../mail/schemas/demo-lead.schema";
import { leadChannel } from "../mail/lead-channel";
import { User, UserDocument } from "../users/schemas/user.schema";
import { decryptSecret, encryptSecret, newToken } from "./mailer-crypto";
import { COMPETITORS, findCompetitor, savingsFor } from "./mailer-competitors";
import {
  asksToUnsubscribe,
  domainOf,
  guessCategory,
  htmlToText,
  isAutoReply,
  isBulk,
  isCompanyDomain,
  isSystemSender,
  replySnippet,
  LEAD_STAGES,
  leadStage,
  waitingLeads,
} from "./mailer-funnel-parse";
import { senderKeysOf } from "./mailer-campaigns.service";
import { MailerListsService } from "./mailer-lists.service";
import { mailerVisits } from "./mailer-ga";
import { utmSlug } from "./mailer-personalize";
import { MailerSettingsService } from "./mailer-settings.service";
import {
  Campaign,
  CampaignDocument,
  CampaignRecipient,
  CampaignRecipientDocument,
  MailerFunnelConfig,
  MailerFunnelConfigDocument,
  MailEvent,
  MailEventDocument,
  MailingList,
  MailingListDocument,
  MailReply,
  MailReplyDocument,
  REPLY_CATEGORIES,
  ReplyCategory,
} from "./schemas/mailer.schemas";

export const FUNNEL_STAGES = [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "replied",
  "interest",
  "demo",
  "registered",
  "active",
] as const;
type Stage = (typeof FUNNEL_STAGES)[number];
type Counts = Record<Stage, number> & { unsubscribed: number };

const zero = (): Counts => ({
  sent: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  replied: 0,
  interest: 0,
  demo: 0,
  registered: 0,
  active: 0,
  unsubscribed: 0,
});

export type InboxInput = {
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPass?: string;
};

const MIN_REAL_CAMPAIGN = 10;
const REPLY_SORT_VERSION = 4; // 4: direct inquiries
const PARSE_VERSION = 3; // 3: direct inquiries, UID, flags, attachments

// "ByggExp (Brevo)" → "ByggExp"; campaigns of deleted senders fall back to
// the first word of the campaign name ("Nordkod – utan hemsida").
const brandOf = (senderLabel: string, campaignName: string) =>
  senderLabel.replace(/\s*\(.*\)\s*$/, "").trim() ||
  campaignName.split(/\s+[–-]\s+|\s+/)[0] ||
  "";

@Injectable()
export class MailerFunnelService {
  private readonly logger = new Logger(MailerFunnelService.name);
  private syncing = false;
  private syncStartedAt = 0;

  constructor(
    @InjectModel(Campaign.name)
    private readonly campaigns: Model<CampaignDocument>,
    @InjectModel(CampaignRecipient.name)
    private readonly recipients: Model<CampaignRecipientDocument>,
    @InjectModel(MailingList.name)
    private readonly lists: Model<MailingListDocument>,
    @InjectModel(MailReply.name)
    private readonly replies: Model<MailReplyDocument>,
    @InjectModel(MailEvent.name)
    private readonly events: Model<MailEventDocument>,
    @InjectModel(MailerFunnelConfig.name)
    private readonly config: Model<MailerFunnelConfigDocument>,
    @InjectModel(Company.name)
    private readonly companies: Model<CompanyDocument>,
    @InjectModel(User.name)
    private readonly users: Model<UserDocument>,
    @InjectModel(DemoLead.name)
    private readonly demoLeads: Model<DemoLeadDocument>,
    private readonly settings: MailerSettingsService,
    private readonly listsService: MailerListsService,
    private readonly mail: MailService,
  ) {}

  private async cfg() {
    return (
      (await this.config.findOne({ key: "main" })) ||
      (await this.config.create({ key: "main" }))
    );
  }

  // ---------- funnel ----------

  // Campaigns behind the current tab: brand, period (start day) and picked ids.
  private async pick(q: {
    brand?: string;
    campaignIds?: string[];
    from?: string;
    to?: string;
  }) {
    const [all, lists, senders] = await Promise.all([
      this.campaigns
        .find({ status: { $ne: "draft" } }, { snapshot: 0 })
        .sort({ startedAt: -1, createdAt: -1 })
        .lean(),
      this.lists.find({}, { name: 1 }).lean(),
      this.settings.listSenders(),
    ]);
    const senderLabel = new Map(senders.map((s) => [s.key, s.label]));
    const listName = new Map(lists.map((l) => [String(l._id), l.name]));
    // Tiny sends (a few mails to our own inboxes) are tests, not outreach.
    const rows = all
      .filter((c) => (c.stats?.total || 0) >= MIN_REAL_CAMPAIGN)
      .map((c) => ({
        c,
        brand: brandOf(senderLabel.get(senderKeysOf(c)[0]) || "", c.name),
      }));
    const brands = [...new Set(rows.map((r) => r.brand).filter(Boolean))];

    const wanted = new Set(q.campaignIds?.filter(Boolean) ?? []);
    // Period = when the campaign started (a cohort), whole days, inclusive.
    const day = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
    const from = day(q.from);
    const to = day(q.to);
    const startDay = (c: (typeof all)[number]) =>
      new Date(
        c.startedAt || (c as { createdAt?: Date }).createdAt || 0,
      ).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
    const inPeriod = (c: (typeof all)[number]) =>
      (!from || startDay(c) >= from) && (!to || startDay(c) <= to);
    const picked = rows.filter(
      (r) =>
        (!q.brand || r.brand === q.brand) &&
        inPeriod(r.c) &&
        (!wanted.size || wanted.has(String(r.c._id))),
    );
    return { rows, picked, brands, listName, from, to };
  }

  // Funnel + per-campaign table + replies + sign-ups. `publicView` drops
  // e-mail addresses and reply texts (the share link is for colleagues).
  async funnel(
    q: { brand?: string; campaignIds?: string[]; from?: string; to?: string },
    publicView = false,
  ) {
    const [{ rows, picked, brands, listName, from, to }, cfg] =
      await Promise.all([this.pick(q), this.cfg()]);
    const ids = picked.map((r) => r.c._id);

    const match = await this.matcher(ids);
    const [replies, signups, demos, ga, waiting] = await Promise.all([
      this.replies
        .find({ campaignId: { $in: ids } })
        .sort({ receivedAt: -1 })
        .lean(),
      this.signups(match),
      this.demos(match, from, to),
      mailerVisits(),
      publicView ? [] : this.waiting(ids, q.brand),
    ]);

    const per = new Map<string, Counts>();
    for (const { c } of picked) {
      const s = c.stats || ({} as Campaign["stats"]);
      const k = zero();
      k.sent = s.sent || 0;
      k.delivered = Math.max(0, k.sent - (s.bounced || 0));
      k.opened = s.opened || 0;
      k.clicked = s.clicked || 0;
      k.unsubscribed = s.unsubscribed || 0;
      per.set(String(c._id), k);
    }
    const replyMix: Record<string, number> = {};
    const competitorMix: Record<string, number> = {};
    for (const r of replies) {
      const k = per.get(String(r.campaignId));
      if (!k || r.category === "auto") continue;
      replyMix[r.category || ""] = (replyMix[r.category || ""] || 0) + 1;
      if (r.competitor)
        competitorMix[r.competitor] = (competitorMix[r.competitor] || 0) + 1;
      k.replied += 1;
      if (r.category === "interest") k.interest += 1;
    }
    for (const d of demos) {
      const k = d.campaignId ? per.get(d.campaignId) : undefined;
      if (k) k.demo += 1;
    }
    for (const s of signups) {
      const k = per.get(s.campaignId);
      if (!k) continue;
      k.registered += 1;
      if (s.active) k.active += 1;
    }

    const totals = zero();
    for (const k of per.values())
      for (const key of Object.keys(totals) as (keyof Counts)[])
        totals[key] += k[key];

    const nameOf = new Map(picked.map((r) => [String(r.c._id), r.c.name]));
    return {
      brands,
      campaigns: rows.map((r) => ({
        _id: String(r.c._id),
        name: r.c.name,
        brand: r.brand,
      })),
      totals,
      visits: ga
        ? picked.reduce(
            (n, { c }) => n + (ga.get(utmSlug(c.name))?.sessions ?? 0),
            0,
          )
        : null,
      replyMix,
      competitors: Object.entries(competitorMix)
        .sort((a, b) => b[1] - a[1])
        .map(([name, n]) => ({
          name,
          n,
          saving5: savingsFor(name).find((x) => x.users === 5)?.saving ?? null,
        })),
      insights: q.brand
        ? (cfg.brandInsights?.[q.brand]?.items ?? [])
        : cfg.insights,
      insightsAt: q.brand
        ? (cfg.brandInsights?.[q.brand]?.at ?? null)
        : cfg.insightsAt,
      rows: picked.map(({ c, brand }) => ({
        _id: String(c._id),
        name: c.name,
        brand,
        listName: c.listId ? listName.get(String(c.listId)) || "" : "",
        status: c.status,
        startedAt: c.startedAt,
        total: c.stats?.total || 0,
        ...per.get(String(c._id)),
        visits: ga ? (ga.get(utmSlug(c.name))?.sessions ?? 0) : null,
        avgSeconds: ga ? (ga.get(utmSlug(c.name))?.avgSeconds ?? null) : null,
      })),
      replies: replies
        .filter((r) => r.category !== "auto" || !publicView)
        .map((r) => ({
          _id: String(r._id),
          company: r.company || domainOf(r.email),
          name: publicView ? "" : r.name,
          email: publicView ? "" : r.email,
          snippet: publicView ? "" : r.snippet,
          note: r.note,
          category: r.category,
          stage: leadStage(r),
          competitor: r.competitor,
          campaignName: nameOf.get(String(r.campaignId)) || "",
          receivedAt: r.receivedAt,
        })),
      waiting,
      demos: demos.map((d) => ({
        name: publicView ? "" : d.name,
        email: publicView ? "" : d.email,
        phone: publicView ? "" : d.phone,
        campaignName: d.campaignId ? nameOf.get(d.campaignId) || "" : "",
        channel: d.channel,
        createdAt: d.createdAt,
      })),
      signups: signups.map((s) => ({
        company: s.company,
        campaignName: nameOf.get(s.campaignId) || "",
        createdAt: s.createdAt,
        active: s.active,
      })),
      updatedAt: new Date(),
    };
  }

  // Every company the tab's campaigns went to, by delivery state:
  // sent / queued (incl. being sent right now) / failed. Admin only.
  async recipientList(q: {
    brand?: string;
    campaignIds?: string[];
    from?: string;
    to?: string;
    status?: string;
    search?: string;
    page?: number;
  }) {
    const { picked } = await this.pick(q);
    const ids = picked.map((r) => r.c._id);
    const nameOf = new Map(picked.map((r) => [String(r.c._id), r.c.name]));
    const STATES: Record<string, string[]> = {
      sent: ["sent"],
      queued: ["queued", "sending"],
      failed: ["failed"],
    };
    const status = STATES[q.status || ""] ? q.status! : "sent";
    const search = String(q.search || "").trim();
    const filter: Record<string, unknown> = {
      campaignId: { $in: ids },
      status: { $in: STATES[status] },
    };
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ email: re }, { company: re }, { name: re }];
    }
    const limit = 50;
    const page = Math.max(1, Number(q.page) || 1);
    const [byStatus, total, items] = await Promise.all([
      this.recipients.aggregate<{ _id: string; n: number }>([
        { $match: { campaignId: { $in: ids } } },
        { $group: { _id: "$status", n: { $sum: 1 } } },
      ]),
      this.recipients.countDocuments(filter),
      this.recipients
        .find(filter, {
          email: 1,
          name: 1,
          company: 1,
          campaignId: 1,
          sentAt: 1,
          openedAt: 1,
          clickedAt: 1,
          error: 1,
        })
        .sort(status === "sent" ? { sentAt: -1 } : { _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);
    const n = new Map(byStatus.map((x) => [x._id, x.n]));
    const counts = Object.fromEntries(
      Object.entries(STATES).map(([k, v]) => [
        k,
        v.reduce((sum, st) => sum + (n.get(st) || 0), 0),
      ]),
    );
    const replied = new Set(
      (
        await this.replies
          .find(
            {
              recipientId: { $in: items.map((r) => r._id) },
              category: { $ne: "auto" },
            },
            { recipientId: 1 },
          )
          .lean()
      ).map((r) => String(r.recipientId)),
    );
    return {
      status,
      counts,
      total,
      page,
      limit,
      items: items.map((r) => ({
        _id: String(r._id),
        company: r.company || domainOf(r.email),
        name: r.name,
        email: r.email,
        campaignName: nameOf.get(String(r.campaignId)) || "",
        sentAt: r.sentAt,
        openedAt: r.openedAt,
        clickedAt: r.clickedAt,
        replied: replied.has(String(r._id)),
        error: r.error,
      })),
    };
  }

  // Finds the campaign a person came from: mail link UTM first, else the
  // last mail sent to the same address or firm domain before `at`.
  private async matcher(ids: Types.ObjectId[]) {
    const sent = ids.length
      ? await this.recipients
          .find(
            { campaignId: { $in: ids }, status: "sent" },
            { email: 1, campaignId: 1, sentAt: 1 },
          )
          .lean()
      : [];
    const first = sent.reduce(
      (m, r) => (r.sentAt && r.sentAt < m ? r.sentAt : m),
      new Date(),
    );
    const byKey = new Map<string, typeof sent>();
    const add = (k: string, r: (typeof sent)[number]) =>
      byKey.set(k, [...(byKey.get(k) ?? []), r]);
    for (const r of sent) {
      add(r.email, r);
      const d = domainOf(r.email);
      if (isCompanyDomain(d)) add(`@${d}`, r);
    }
    const bySlug = new Map(
      ids.length
        ? (
            await this.campaigns.find({ _id: { $in: ids } }, { name: 1 }).lean()
          ).map((c) => [utmSlug(c.name), String(c._id)])
        : [],
    );
    const find = (
      emails: string[],
      at: Date,
      utm?: { utmSource?: string; utmCampaign?: string } | null,
    ): string | undefined => {
      if (utm?.utmSource === "mailer") {
        const hit = bySlug.get(String(utm.utmCampaign || ""));
        if (hit) return hit;
      }
      const keys = new Set<string>();
      for (const e of emails) {
        const email = String(e || "")
          .toLowerCase()
          .trim();
        if (!email) continue;
        keys.add(email);
        const d = domainOf(email);
        if (isCompanyDomain(d)) keys.add(`@${d}`);
      }
      const hits = [...keys]
        .flatMap((k) => byKey.get(k) ?? [])
        .filter((r) => r.sentAt && r.sentAt <= at)
        .sort((a, b) => +b.sentAt! - +a.sentAt!);
      return hits.length ? String(hits[0].campaignId) : undefined;
    };
    return { any: sent.length > 0, first, find };
  }

  // All demo requests from the site in the period. The ones that came from a
  // mail get its campaign (funnel "Demo" stage); the rest are counted apart.
  private async demos(
    match: Awaited<ReturnType<MailerFunnelService["matcher"]>>,
    from: string,
    to: string,
  ) {
    const leads = await this.demoLeads
      .find({})
      .sort({ createdAt: -1 })
      .lean<(DemoLead & { createdAt: Date })[]>();
    const dayOf = (d: Date) =>
      d.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
    return leads
      .filter(
        (l) =>
          (!from || dayOf(l.createdAt) >= from) &&
          (!to || dayOf(l.createdAt) <= to),
      )
      .map((l) => ({
        name: l.name,
        email: l.email.endsWith("@byggexp.se") ? "" : l.email,
        phone: l.phone,
        createdAt: l.createdAt,
        campaignId: match.find([l.email], l.createdAt, l),
        channel: leadChannel(l),
      }));
  }

  // Companies that signed up after getting one of these campaigns: same
  // address, or same firm domain. Credited to the last mail before sign-up.
  private async signups(
    match: Awaited<ReturnType<MailerFunnelService["matcher"]>>,
  ) {
    if (!match.any) return [];
    const first = match.first;
    const companies = await this.companies
      .find(
        { createdAt: { $gte: first }, label: { $nin: ["own", "test"] } },
        {
          name: 1,
          email: 1,
          createdAt: 1,
          projects: 1,
          subscriptionStatus: 1,
          signupSource: 1,
        },
      )
      .lean<
        {
          _id: Types.ObjectId;
          name: string;
          email: string;
          createdAt: Date;
          projects: string[];
          subscriptionStatus?: string | null;
          signupSource?: { utmSource?: string; utmCampaign?: string } | null;
        }[]
      >();
    if (!companies.length) return [];
    const users = await this.users
      .find(
        { companyId: { $in: companies.map((c) => String(c._id)) } },
        { email: 1, companyId: 1 },
      )
      .lean();
    const emailsOf = new Map<string, string[]>();
    for (const c of companies) emailsOf.set(String(c._id), [c.email]);
    for (const u of users)
      emailsOf.get(String(u.companyId))?.push(String(u.email));

    const out: {
      campaignId: string;
      company: string;
      createdAt: Date;
      active: boolean;
    }[] = [];
    for (const c of companies) {
      const campaignId = match.find(
        emailsOf.get(String(c._id)) ?? [],
        c.createdAt,
        c.signupSource,
      );
      if (!campaignId) continue;
      out.push({
        campaignId,
        company: c.name || c.email,
        createdAt: c.createdAt,
        active:
          (c.projects?.length ?? 0) > 0 || c.subscriptionStatus === "active",
      });
    }
    return out;
  }

  async updateReply(
    id: string,
    input: {
      category?: string;
      note?: string;
      answered?: boolean;
      stage?: string;
    },
  ) {
    if (!isValidObjectId(id)) throw new NotFoundException("Not found");
    const set: Partial<MailReply> = {};
    if (input.answered !== undefined) set.answered = input.answered;
    if (input.stage !== undefined) {
      if (
        input.stage &&
        !(LEAD_STAGES as readonly string[]).includes(input.stage)
      )
        throw new BadRequestException("Okänt steg");
      set.stage = input.stage;
    }
    if (input.category !== undefined) {
      if (!(REPLY_CATEGORIES as readonly string[]).includes(input.category))
        throw new BadRequestException("Okänd kategori");
      set.category = input.category as ReplyCategory;
    }
    if (input.note !== undefined) set.note = String(input.note).slice(0, 300);
    const r = await this.replies.findByIdAndUpdate(id, set, { new: true });
    if (!r) throw new NotFoundException("Not found");
    if (set.category === "unsubscribe")
      await this.listsService.markEverywhere(r.email, "unsubscribed");
    return r;
  }

  // ---------- share link ----------

  async share() {
    const c = await this.cfg();
    return { token: c.shareToken, edit: Boolean(c.shareEdit) };
  }

  async setShare(enabled: boolean, edit?: boolean) {
    const c = await this.cfg();
    c.shareToken = enabled ? c.shareToken || newToken() : "";
    if (edit !== undefined) c.shareEdit = edit;
    if (!enabled) c.shareEdit = false;
    await c.save();
    return { token: c.shareToken, edit: Boolean(c.shareEdit) };
  }

  private async sharedCfg(token: string) {
    const c = await this.cfg();
    if (!c.shareToken || token !== c.shareToken)
      throw new NotFoundException("Not found");
    return c;
  }

  // Read-only link: no addresses or mail texts. Edit link: the full lists.
  async publicFunnel(
    token: string,
    q: { brand?: string; from?: string; to?: string },
  ) {
    const c = await this.sharedCfg(token);
    const data = await this.funnel(q, !c.shareEdit);
    return { ...data, canEdit: Boolean(c.shareEdit) };
  }

  async publicUpdateReply(
    token: string,
    id: string,
    input: Parameters<MailerFunnelService["updateReply"]>[1],
  ) {
    const c = await this.sharedCfg(token);
    if (!c.shareEdit) throw new NotFoundException("Not found");
    return this.updateReply(id, input);
  }

  // ---------- leads waiting for an answer ----------

  // Latest mail per sender that we have not answered: replies to the tab's
  // campaigns + new inquiries to the tab's mailbox (all mailboxes on "All").
  private async waiting(ids: Types.ObjectId[], brand?: string) {
    const since = new Date(Date.now() - 60 * 864e5);
    const box = brand ? await this.boxFor(brand) : null;
    const mails = await this.replies
      .find({
        receivedAt: { $gte: since },
        $or: [
          { campaignId: { $in: ids } },
          { direct: true, ...(box ? { inbox: box.key } : {}) },
        ],
      })
      .lean();
    const cfgs = await this.config
      .find({}, { key: 1, imapHost: 1, imapUser: 1 })
      .lean();
    const boxes = new Map(cfgs.map((c) => [c.key, c]));
    // Our own test mails between our mailboxes are not leads.
    const own = new Set(
      cfgs
        .map((c) => domainOf(c.imapUser || ""))
        .filter((d) => d && isCompanyDomain(d)),
    );
    return waitingLeads(mails.filter((m) => !own.has(domainOf(m.email)))).map(
      (m) => {
        const c = boxes.get(m.inbox || "main");
        return {
          _id: String(m._id),
          name: m.name,
          email: m.email,
          company: m.company || domainOf(m.email),
          subject: m.subject,
          snippet: m.snippet,
          note: m.note,
          category: m.category,
          direct: Boolean(m.direct),
          files: m.files || [],
          receivedAt: m.receivedAt,
          mailbox: c?.imapUser || "",
          openUrl:
            c?.imapHost && m.uid
              ? `https://${c.imapHost}/webmail/?_task=mail&_mbox=INBOX&_uid=${m.uid}&_action=show`
              : "",
        };
      },
    );
  }

  // Every hour in the working day: leads waiting > 4 h get one mail to the
  // owner (the same address site demo requests go to).
  @Cron("0 0 8-19 * * *", { timeZone: "Europe/Stockholm" })
  async alertWaiting() {
    const mails = await this.replies
      .find({ receivedAt: { $gte: new Date(Date.now() - 14 * 864e5) } })
      .lean();
    const due = waitingLeads(mails).filter(
      (m) =>
        !m.alertedAt &&
        new Date(m.receivedAt || 0).getTime() < Date.now() - 4 * 36e5,
    );
    if (!due.length) return 0;
    const rows = due.map(
      (m) =>
        `${m.name || m.email} — ${m.subject || ""}${m.files?.length ? ` (${m.files.length} bilagor)` : ""}`,
    );
    try {
      for (const to of this.mail.getDemoRequestRecipients())
        await this.mail.sendHtmlEmail({
          to,
          subject: `Obesvarade leads: ${due.length}`,
          text: rows.join("\n"),
          html: `<ul>${rows.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul><p><a href="https://admin.byggexp.se/admin/mailer/funnel">Tratt → Att svara</a></p>`,
        });
    } catch (err) {
      this.logger.warn(`Lead alert failed: ${err}`);
      return 0;
    }
    await this.replies.updateMany(
      { _id: { $in: due.map((m) => m._id) } },
      { alertedAt: new Date() },
    );
    return due.length;
  }

  // ---------- inbox (IMAP) ----------

  // Reply mailboxes: "main" + one per brand whose reply address is another
  // mailbox ("inbox:<brand>", e.g. Agry → alex@agry.se).
  private async boxFor(brand?: string) {
    const main = await this.cfg();
    if (!brand) return main;
    const own = await this.config.findOne({ key: `inbox:${brand}` });
    if (own) return own;
    const addr = await this.replyAddressOf(brand);
    if (!addr || addr === main.imapUser) return main;
    // Not saved yet — the form opens prefilled with the brand's reply address.
    return new this.config({
      key: `inbox:${brand}`,
      imapHost: main.imapHost,
      imapPort: main.imapPort,
      imapUser: addr,
    });
  }

  private async replyAddressOf(brand: string) {
    for (const s of await this.settings.listSenders()) {
      if (brandOf(s.label, "") !== brand) continue;
      const p = await this.settings.getPublic(s.key);
      return String(p.replyTo || p.fromEmail || "").toLowerCase();
    }
    return "";
  }

  async inbox(brand?: string) {
    return this.boxStatus(await this.boxFor(brand));
  }

  private boxStatus(c: MailerFunnelConfigDocument) {
    return {
      imapHost: c.imapHost,
      imapPort: c.imapPort,
      imapUser: c.imapUser,
      hasPassword: Boolean(c.imapPassEnc),
      lastSyncAt: c.lastSyncAt,
      lastError: c.lastError,
    };
  }

  async updateInbox(input: InboxInput, brand?: string) {
    const c = await this.boxFor(brand);
    const host = String(input.imapHost ?? c.imapHost).trim();
    const user = String(input.imapUser ?? c.imapUser).trim();
    // Another mailbox → read it from the start.
    if (host !== c.imapHost || user !== c.imapUser) {
      c.lastUid = 0;
      c.uidValidity = "";
    }
    c.imapHost = host;
    c.imapUser = user;
    if (input.imapPort) c.imapPort = Number(input.imapPort) || 993;
    if (input.imapPass) c.imapPassEnc = encryptSecret(String(input.imapPass));
    await c.save();
    const added = await this.syncBox(c);
    await this.sortReplies();
    return { ...this.boxStatus(c), added };
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async cron() {
    if (cronsDisabled()) return;
    await this.syncInbox().catch((err) =>
      this.logger.warn(`Inbox sync failed: ${err}`),
    );
    // Monday 07:00 run can be missed (restart/deploy at that minute) —
    // catch up when the conclusions are older than a week.
    const c = await this.cfg();
    const weekAgo = Date.now() - 7 * 24 * 3600_000;
    const { brands } = await this.pick({});
    const stale = (at?: Date | null) => !at || +new Date(at) < weekAgo;
    if (
      claudeEnabled() &&
      (stale(c.insightsAt) ||
        brands.some((b) => stale(c.brandInsights?.[b]?.at)))
    )
      await this.allInsights();
  }

  // Reads every reply mailbox and stores the mails that answer a campaign.
  async syncInbox() {
    const main = await this.cfg();
    const extra = await this.config.find({ key: /^inbox:/ });
    let added = 0;
    for (const c of [main, ...extra]) added += await this.syncBox(c);
    await this.sortReplies();
    return { ...this.boxStatus(main), added };
  }

  private async syncBox(c: MailerFunnelConfigDocument): Promise<number> {
    if (!c.imapHost || !c.imapUser || !c.imapPassEnc) return 0;
    // A sync older than 2 min is a hung connection — don't let it block all
    // later syncs forever.
    if (this.syncing && Date.now() - this.syncStartedAt < 120_000) return 0;
    this.syncing = true;
    this.syncStartedAt = Date.now();
    let added = 0;
    const client = new ImapFlow({
      host: c.imapHost,
      port: c.imapPort || 993,
      secure: (c.imapPort || 993) === 993,
      auth: { user: c.imapUser, pass: decryptSecret(c.imapPassEnc) },
      logger: false,
      greetingTimeout: 20_000,
      socketTimeout: 60_000,
    });
    const timer = setTimeout(() => client.close(), 90_000);
    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const box = client.mailbox;
        const validity = box ? String(box.uidValidity) : "";
        // Parser changed → read the whole inbox once more (existing replies
        // only get their text refreshed).
        const rescan = (c.parseVersion || 0) < PARSE_VERSION;
        const fromUid =
          validity === c.uidValidity && !rescan ? c.lastUid + 1 : 1;
        let range: string | number[] = `${fromUid}:*`;
        if (fromUid === 1) {
          // First read: only mail since the first campaign went out.
          const first = await this.campaigns
            .findOne({ startedAt: { $ne: null } }, { startedAt: 1 })
            .sort({ startedAt: 1 })
            .lean();
          const found = await client.search(
            { since: first?.startedAt || new Date() },
            { uid: true },
          );
          range = found || [];
        }
        let maxUid = c.lastUid;
        if (!Array.isArray(range) || range.length)
          for await (const msg of client.fetch(
            range,
            { uid: true, source: true, flags: true },
            { uid: true },
          )) {
            if (msg.uid < fromUid) continue; // "N:*" returns the last mail
            maxUid = Math.max(maxUid, msg.uid);
            if (
              msg.source &&
              (await this.storeReply(msg.source, {
                inbox: c.key,
                own: c.imapUser,
                uid: msg.uid,
                answered: Boolean(msg.flags?.has("\\Answered")),
              }))
            )
              added += 1;
          }
        await this.refreshAnswered(client, c.key);
        c.uidValidity = validity;
        c.lastUid = maxUid;
        c.parseVersion = PARSE_VERSION;
      } finally {
        lock.release();
      }
      await client.logout();
      c.lastError = "";
    } catch (err) {
      c.lastError = (err instanceof Error ? err.message : String(err)).slice(
        0,
        300,
      );
      client.close();
    } finally {
      clearTimeout(timer);
      this.syncing = false;
    }
    c.lastSyncAt = new Date();
    await c.save();
    return added;
  }

  private async sortReplies() {
    await this.classifyPending().catch(async (err) => {
      this.logger.warn(`Reply classification failed: ${err}`);
      await this.config.updateOne(
        { key: "main" },
        { lastError: `AI: ${String(err).slice(0, 250)}` },
      );
    });
  }

  // Answered later (in webmail) → the \\Answered flag flips; re-read it for
  // the leads of the last 60 days that still wait.
  private async refreshAnswered(client: ImapFlow, inbox: string) {
    const waiting = await this.replies
      .find(
        {
          inbox,
          answered: { $ne: true },
          uid: { $ne: null },
          receivedAt: { $gte: new Date(Date.now() - 60 * 864e5) },
        },
        { uid: 1 },
      )
      .lean();
    if (!waiting.length) return;
    const done: number[] = [];
    for await (const msg of client.fetch(
      waiting.map((w) => w.uid as number),
      { uid: true, flags: true },
      { uid: true },
    ))
      if (msg.flags?.has("\\Answered")) done.push(msg.uid);
    if (done.length)
      await this.replies.updateMany(
        { inbox, uid: { $in: done } },
        { answered: true },
      );
  }

  // true when the mail is a new reply to a campaign or a new inquiry.
  private async storeReply(
    source: Buffer,
    box: { inbox: string; own: string; uid: number; answered: boolean },
  ): Promise<boolean> {
    const mail = await simpleParser(source);
    const from = mail.from?.value?.[0];
    const email = String(from?.address || "")
      .toLowerCase()
      .trim();
    if (!email || isSystemSender(email) || email === box.own) return false;
    const received = mail.date || new Date();
    const messageId =
      mail.messageId || `${email}:${received.toISOString()}:${mail.subject}`;
    const text =
      mail.text || htmlToText(typeof mail.html === "string" ? mail.html : "");
    const files = (mail.attachments || [])
      .filter((a) => a.contentDisposition !== "inline" && a.filename)
      .map((a) => ({ name: String(a.filename).slice(0, 200), size: a.size }));
    const lead = {
      inbox: box.inbox,
      uid: box.uid,
      files,
      ...(box.answered ? { answered: true } : {}),
    };
    const existing = await this.replies
      .findOne({ messageId }, { snippet: 1 })
      .lean();
    if (existing) {
      await this.replies.updateOne({ _id: existing._id }, lead);
      // Re-read after a parser fix: fill a snippet that came out empty and
      // let it be sorted again.
      const snippet = replySnippet(text);
      if (snippet && snippet !== existing.snippet)
        await this.replies.updateOne(
          { _id: existing._id },
          {
            snippet,
            sortVersion: 0,
            ...(existing.snippet ? {} : { category: "", note: "" }),
          },
        );
      return false;
    }

    // Same address first; else a colleague at the same firm domain.
    let r = await this.recipients
      .findOne({ email, status: "sent", sentAt: { $lte: received } })
      .sort({ sentAt: -1 })
      .lean();
    const domain = domainOf(email);
    if (!r && isCompanyDomain(domain))
      r = await this.recipients
        .findOne({
          email: new RegExp(
            `@${domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          ),
          status: "sent",
          sentAt: { $lte: received },
        })
        .sort({ sentAt: -1 })
        .lean();
    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of mail.headers)
      headers[k.toLowerCase()] =
        typeof v === "string" ? v : v ? String(v) : undefined;
    // Not a campaign reply: keep it as a new inquiry (a firm asking for a
    // price, drawings attached…) unless it is mass mail or an auto-reply.
    if (!r) {
      if (
        isBulk(headers) ||
        isAutoReply(mail.subject || "", headers) ||
        /^\[test\]/i.test(mail.subject || "") // our own test sends
      )
        return false;
      await this.replies.create({
        ...lead,
        messageId,
        direct: true,
        email,
        name: from?.name || "",
        company: "",
        subject: (mail.subject || "").slice(0, 300),
        snippet: replySnippet(text),
        receivedAt: received,
      });
      return true;
    }
    const subject = mail.subject || "";
    const snippet = replySnippet(text);
    let category: ReplyCategory = "";
    if (isAutoReply(subject, headers)) category = "auto";
    else if (asksToUnsubscribe(snippet)) category = "unsubscribe";

    await this.replies.create({
      ...lead,
      messageId,
      campaignId: r.campaignId,
      recipientId: r._id,
      email,
      name: from?.name || r.name || "",
      company: r.company || "",
      subject: subject.slice(0, 300),
      snippet,
      receivedAt: received,
      category,
    });
    if (category === "auto") return true;
    if (category === "unsubscribe")
      await this.listsService.markEverywhere(email, "unsubscribed");
    await this.events.create({
      type: "reply",
      campaignId: r.campaignId,
      email,
      detail: snippet.slice(0, 500),
    });
    return true;
  }

  // Sorts new replies with Claude: no / uses another service / later /
  // interest / unsubscribe, plus a short note. Each reply is tried once.
  async classifyPending() {
    const pending = await this.replies
      .find({ sortVersion: { $not: { $gte: REPLY_SORT_VERSION } } })
      .sort({ receivedAt: 1 })
      .limit(40)
      .lean();
    if (!pending.length) return 0;
    if (!claudeEnabled()) {
      for (const r of pending) await this.applyGuess(r, {});
      return pending.length;
    }
    const items = pending.map((r) => ({
      id: String(r._id),
      ...(r.direct ? { direct: true } : {}),
      company: r.company,
      subject: r.subject,
      text: r.snippet,
    }));
    const prompt = `We sent Swedish construction firms a cold email about ByggExp (an app for time reports, invoices and projects). Classify each reply.

Categories:
- "interest": wants to talk, try it, a call or a demo
- "later": maybe later, not now, no employees yet, will come back
- "has_system": already uses another system/app/service for this
- "no": just a no / not interested / no thanks, without a reason about another system
- "unsubscribe": asks to be removed, unsubscribed or not to be mailed again (also an empty mail whose subject is "unsubscribe")
- "auto": automatic reply (out of office, ticket received, "we answer in turn"), or an empty reply with no message
- "": cannot tell

Items with "direct": true are not replies but new mails to our inbox. A request for a price/quote, a tender (anbudsförfrågan), drawings, a job or a question about our work → "interest"; ads, newsletters, invoices, notifications, recruiting offers → "no".

Also return:
- "competitor": the product they already use, as its usual name (e.g. "Softone", "Bygglet", "Fieldly", "Fortnox", "SmartDok"), "Eget system" if they built their own, else "".
- "note": at most 6 words in Russian summarising the reply (e.g. "Softone, довольны", "Позвонить в понедельник", "Не интересно").

Return only JSON: {"items":[{"id":"...","category":"...","competitor":"...","note":"..."}]}

Replies:
${JSON.stringify(items)}`;
    let out: {
      items?: {
        id?: string;
        category?: string;
        competitor?: string;
        note?: string;
      }[];
    };
    try {
      const reply = await callClaude({
        model: process.env.MAILER_REPLY_MODEL || "claude-haiku-5-5",
        maxTokens: 4096,
        content: [{ type: "text", text: prompt }],
      });
      out = parseJsonObject(reply);
    } catch (err) {
      // Still sort the obvious ones, then report why AI failed.
      for (const r of pending) await this.applyGuess(r, {});
      throw err;
    }
    const byId = new Map((out.items || []).map((i) => [String(i.id), i]));
    for (const r of pending) {
      const ai = byId.get(String(r._id)) || {};
      await this.applyGuess(r, {
        category: String(ai.category ?? ""),
        competitor: String(ai.competitor ?? ""),
        note: String(ai.note ?? ""),
      });
    }
    return pending.length;
  }

  // AI result if valid, else keyword rules. Never overwrites what is already
  // set (a category or note picked by hand always wins).
  private async applyGuess(
    r: {
      _id: Types.ObjectId;
      subject: string;
      snippet: string;
      note: string;
      email: string;
      category: ReplyCategory;
      competitor?: string;
    },
    ai: { category?: string; competitor?: string; note?: string },
  ) {
    const text = `${r.subject}\n${r.snippet}`;
    const set: Partial<MailReply> = { sortVersion: REPLY_SORT_VERSION };
    if (!r.category) {
      let category: ReplyCategory = (
        REPLY_CATEGORIES as readonly string[]
      ).includes(ai.category || "")
        ? (ai.category as ReplyCategory)
        : "";
      if (!category) category = guessCategory(text);
      if (category) set.category = category;
      if (category === "unsubscribe")
        await this.listsService.markEverywhere(r.email, "unsubscribed");
    }
    if (!r.competitor) {
      const known = findCompetitor(`${ai.competitor || ""} ${text} ${r.note}`);
      const competitor = known?.name || (ai.competitor || "").trim();
      if (competitor) set.competitor = competitor.slice(0, 60);
    }
    if (ai.note && !r.note) set.note = ai.note.slice(0, 120);
    await this.replies.updateOne({ _id: r._id }, set);
  }

  // ---------- reply draft with a savings figure ----------

  async draftReply(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException("Not found");
    const r = await this.replies.findById(id).lean();
    if (!r) throw new NotFoundException("Not found");
    const competitor =
      r.competitor || findCompetitor(`${r.snippet} ${r.note}`)?.name || "";
    const savings = competitor ? savingsFor(competitor) : [];
    const facts = savings.length
      ? `Their system: ${competitor}. List prices per month excl. VAT (theirs vs ByggExp): ${savings
          .map(
            (s) =>
              `${s.users} users: ${s.theirs} kr vs ${s.ours} kr (saves ${s.saving} kr/month)`,
          )
          .join("; ")}. Note on their price: ${
          COMPETITORS.find((c) => c.name === competitor)?.note || ""
        }.`
      : competitor
        ? `Their system: ${competitor}; its price is not public, so ask what they pay today and offer to compare.`
        : "No known system named.";
    const prompt = `Write a short reply in Swedish (max 90 words, friendly, no hard sell) to this answer to our cold email about ByggExp.

ByggExp: 299 kr/month for the office (offers, invoices, receipt scanning, incoming invoices by e-mail with due-date reminders, payroll, project economy) + 69 kr/month per worker (time reports with GPS or manual, live attendance, planning, egenkontroll, tasks with reminders, photo reports, tools via QR). Solo firms pay only 299 kr. No binding period, no setup fee, 2 weeks free trial, free 15-minute video demo.

${facts}

Rules: if savings are given, mention one concrete figure for a typical team (pick 5 users unless the reply says otherwise) and that it is list price. Never invent prices. Respect a "no" — offer to send the comparison or end politely. End with one simple question. Sign as "Alexander, ByggExp".

Their reply (from ${r.name || r.company || r.email}, subject "${r.subject}"):
"""${r.snippet}"""

Return only JSON: {"subject":"Re: ...","body":"..."}`;
    if (!claudeEnabled()) throw new BadRequestException("AI är inte aktiverat");
    const out = parseJsonObject<{ subject?: string; body?: string }>(
      await callClaude({
        model: process.env.MAILER_DRAFT_MODEL || "claude-sonnet-5-5",
        maxTokens: 1024,
        content: [{ type: "text", text: prompt }],
      }),
    );
    return {
      to: r.email,
      subject: String(out.subject || `Re: ${r.subject}`),
      body: String(out.body || ""),
      competitor,
      savings,
    };
  }

  // ---------- weekly conclusions ----------

  @Cron("0 7 * * 1", { timeZone: "Europe/Stockholm" })
  async weeklyInsights() {
    if (cronsDisabled()) return;
    await this.allInsights();
  }

  // "All" tab + one per brand tab.
  private async allInsights() {
    const { brands } = await this.pick({});
    for (const brand of ["", ...brands])
      await this.generateInsights(brand).catch((err) =>
        this.logger.warn(`Insights ${brand || "all"} failed: ${err}`),
      );
  }

  async generateInsights(brand = "") {
    if (!claudeEnabled()) throw new BadRequestException("AI är inte aktiverat");
    const data = await this.funnel({ brand: brand || undefined });
    const subjects = new Map(
      (
        await this.campaigns
          .find({ _id: { $in: data.rows.map((r) => r._id) } }, { subject: 1 })
          .lean()
      ).map((c) => [String(c._id), c.subject]),
    );
    const rows = data.rows.map((r) => ({
      campaign: r.name,
      brand: r.brand,
      list: r.listName,
      subject: subjects.get(r._id) || "",
      start: r.startedAt,
      sent: r.sent,
      delivered: r.delivered,
      opened: r.opened,
      clicked: r.clicked,
      replied: r.replied,
      interest: r.interest,
      unsubscribed: r.unsubscribed,
      signups: r.registered,
    }));
    const replies = data.replies
      .filter((r) => r.category !== "auto")
      .map((r) => ({
        campaign: r.campaignName,
        category: r.category,
        competitor: r.competitor,
        note: r.note,
      }));
    // Only ByggExp sells the app; other brands (Agry, Nordkod…) sell their
    // own service — let the model read what from the subjects.
    const what =
      !brand || brand === "ByggExp"
        ? "ByggExp (Swedish app for construction firms: time reports, projects, invoices; 299 kr/month for the office + 69 kr per worker)"
        : `the brand "${brand}" (work out what it offers from the subjects; do not mention ByggExp)`;
    const prompt = `You analyse cold-email outreach of ${what}. Data below: per-campaign stats and classified replies.

Write 3–5 conclusions in Russian for the owner. Each at most 22 words: the key number from the data, then "→" and one concrete next step. Plain words, no quotes of whole subjects, no lists of campaign names. Cover: which subject/text works best (open and reply rate), main objections and competitors, what to change next. No generic advice, no invented numbers.

Return only JSON: {"items":["...","..."]}

Campaigns: ${JSON.stringify(rows)}
Replies: ${JSON.stringify(replies)}`;
    const out = parseJsonObject<{ items?: string[] }>(
      await callClaude({
        model: process.env.MAILER_INSIGHTS_MODEL || "claude-sonnet-5-5",
        maxTokens: 2048,
        content: [{ type: "text", text: prompt }],
      }),
    );
    const items = (out.items || [])
      .map((x) => String(x).slice(0, 400))
      .slice(0, 6);
    const at = new Date();
    await this.config.updateOne(
      { key: "main" },
      brand
        ? { [`brandInsights.${brand}`]: { items, at } }
        : { insights: items, insightsAt: at },
    );
    return { insights: items, insightsAt: at };
  }
}
