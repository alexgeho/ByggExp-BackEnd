import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { isValidObjectId, Model, Types } from "mongoose";
import {
  callClaude,
  claudeEnabled,
  parseJsonObject,
} from "../common/anthropic.client";
import { cronsDisabled } from "../common/cron.util";
import { Company, CompanyDocument } from "../company/schemas/company.schema";
import { User, UserDocument } from "../users/schemas/user.schema";
import { decryptSecret, encryptSecret, newToken } from "./mailer-crypto";
import {
  asksToUnsubscribe,
  domainOf,
  guessCategory,
  isAutoReply,
  isCompanyDomain,
  isSystemSender,
  replySnippet,
} from "./mailer-funnel-parse";
import { senderKeysOf } from "./mailer-campaigns.service";
import { MailerListsService } from "./mailer-lists.service";
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
    private readonly settings: MailerSettingsService,
    private readonly listsService: MailerListsService,
  ) {}

  private async cfg() {
    return (
      (await this.config.findOne({ key: "main" })) ||
      (await this.config.create({ key: "main" }))
    );
  }

  // ---------- funnel ----------

  // Funnel + per-campaign table + replies + sign-ups. `publicView` drops
  // e-mail addresses and reply texts (the share link is for colleagues).
  async funnel(
    q: { brand?: string; campaignIds?: string[] },
    publicView = false,
  ) {
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
    const picked = rows.filter(
      (r) =>
        (!q.brand || r.brand === q.brand) &&
        (!wanted.size || wanted.has(String(r.c._id))),
    );
    const ids = picked.map((r) => r.c._id);

    const [replies, signups] = await Promise.all([
      this.replies
        .find({ campaignId: { $in: ids } })
        .sort({ receivedAt: -1 })
        .lean(),
      this.signups(ids),
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
    for (const r of replies) {
      const k = per.get(String(r.campaignId));
      if (!k || r.category === "auto") continue;
      replyMix[r.category || ""] = (replyMix[r.category || ""] || 0) + 1;
      k.replied += 1;
      if (r.category === "interest") k.interest += 1;
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
      replyMix,
      rows: picked.map(({ c, brand }) => ({
        _id: String(c._id),
        name: c.name,
        brand,
        listName: c.listId ? listName.get(String(c.listId)) || "" : "",
        status: c.status,
        startedAt: c.startedAt,
        total: c.stats?.total || 0,
        ...per.get(String(c._id)),
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
          campaignName: nameOf.get(String(r.campaignId)) || "",
          receivedAt: r.receivedAt,
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

  // Companies that signed up after getting one of these campaigns: same
  // address, or same firm domain. Credited to the last mail before sign-up.
  private async signups(ids: Types.ObjectId[]) {
    if (!ids.length) return [];
    const sent = await this.recipients
      .find(
        { campaignId: { $in: ids }, status: "sent" },
        { email: 1, campaignId: 1, sentAt: 1 },
      )
      .lean();
    if (!sent.length) return [];
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

    const companies = await this.companies
      .find(
        { createdAt: { $gte: first }, label: { $nin: ["own", "test"] } },
        {
          name: 1,
          email: 1,
          createdAt: 1,
          projects: 1,
          subscriptionStatus: 1,
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
      const keys = new Set<string>();
      for (const e of emailsOf.get(String(c._id)) ?? []) {
        const email = e.toLowerCase().trim();
        keys.add(email);
        const d = domainOf(email);
        if (isCompanyDomain(d)) keys.add(`@${d}`);
      }
      const hits = [...keys]
        .flatMap((k) => byKey.get(k) ?? [])
        .filter((r) => r.sentAt && r.sentAt <= c.createdAt)
        .sort((a, b) => +b.sentAt! - +a.sentAt!);
      if (!hits.length) continue;
      out.push({
        campaignId: String(hits[0].campaignId),
        company: c.name || c.email,
        createdAt: c.createdAt,
        active:
          (c.projects?.length ?? 0) > 0 || c.subscriptionStatus === "active",
      });
    }
    return out;
  }

  async updateReply(id: string, input: { category?: string; note?: string }) {
    if (!isValidObjectId(id)) throw new NotFoundException("Not found");
    const set: Partial<MailReply> = {};
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
    return { token: c.shareToken };
  }

  async setShare(enabled: boolean) {
    const c = await this.cfg();
    c.shareToken = enabled ? c.shareToken || newToken() : "";
    await c.save();
    return { token: c.shareToken };
  }

  async publicFunnel(token: string, brand?: string) {
    const c = await this.cfg();
    if (!c.shareToken || token !== c.shareToken)
      throw new NotFoundException("Not found");
    return this.funnel({ brand }, true);
  }

  // ---------- inbox (IMAP) ----------

  async inbox() {
    const c = await this.cfg();
    return {
      imapHost: c.imapHost,
      imapPort: c.imapPort,
      imapUser: c.imapUser,
      hasPassword: Boolean(c.imapPassEnc),
      lastSyncAt: c.lastSyncAt,
      lastError: c.lastError,
    };
  }

  async updateInbox(input: InboxInput) {
    const c = await this.cfg();
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
    return this.syncInbox();
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async cron() {
    if (cronsDisabled()) return;
    await this.syncInbox().catch((err) =>
      this.logger.warn(`Inbox sync failed: ${err}`),
    );
  }

  // Reads new mail in INBOX and stores the ones that answer a campaign.
  async syncInbox() {
    const c = await this.cfg();
    if (!c.imapHost || !c.imapUser || !c.imapPassEnc)
      return { ...(await this.inbox()), added: 0 };
    if (this.syncing) return { ...(await this.inbox()), added: 0 };
    this.syncing = true;
    let added = 0;
    const client = new ImapFlow({
      host: c.imapHost,
      port: c.imapPort || 993,
      secure: (c.imapPort || 993) === 993,
      auth: { user: c.imapUser, pass: decryptSecret(c.imapPassEnc) },
      logger: false,
    });
    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const box = client.mailbox;
        const validity = box ? String(box.uidValidity) : "";
        const fromUid = validity === c.uidValidity ? c.lastUid + 1 : 1;
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
            { uid: true, source: true },
            { uid: true },
          )) {
            if (msg.uid < fromUid) continue; // "N:*" returns the last mail
            maxUid = Math.max(maxUid, msg.uid);
            if (msg.source && (await this.storeReply(msg.source))) added += 1;
          }
        c.uidValidity = validity;
        c.lastUid = maxUid;
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
      this.syncing = false;
    }
    c.lastSyncAt = new Date();
    await c.save();
    await this.classifyPending().catch(async (err) => {
      this.logger.warn(`Reply classification failed: ${err}`);
      await this.config.updateOne(
        { key: "main" },
        { lastError: `AI: ${String(err).slice(0, 250)}` },
      );
    });
    return { ...(await this.inbox()), added };
  }

  // true when the mail answers one of our campaigns and is new.
  private async storeReply(source: Buffer): Promise<boolean> {
    const mail = await simpleParser(source);
    const from = mail.from?.value?.[0];
    const email = String(from?.address || "")
      .toLowerCase()
      .trim();
    if (!email || isSystemSender(email)) return false;
    const received = mail.date || new Date();
    const messageId =
      mail.messageId || `${email}:${received.toISOString()}:${mail.subject}`;
    if (await this.replies.exists({ messageId })) return false;

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
    if (!r) return false;

    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of mail.headers)
      headers[k.toLowerCase()] = typeof v === "string" ? v : undefined;
    const subject = mail.subject || "";
    const snippet = replySnippet(mail.text || "");
    let category: ReplyCategory = "";
    if (isAutoReply(subject, headers)) category = "auto";
    else if (asksToUnsubscribe(snippet)) category = "unsubscribe";

    await this.replies.create({
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
      .find({ category: "", aiTried: { $ne: true } })
      .sort({ receivedAt: 1 })
      .limit(40)
      .lean();
    if (!pending.length) return 0;
    if (!claudeEnabled()) {
      for (const r of pending) await this.applyGuess(r, "", "");
      return pending.length;
    }
    const items = pending.map((r) => ({
      id: String(r._id),
      company: r.company,
      subject: r.subject,
      text: r.snippet,
    }));
    const prompt = `We sent Swedish construction firms a cold email about ByggExp (an app for time reports, invoices and projects). Classify each reply.

Categories:
- "interest": wants to talk, try it, a call or a demo
- "later": maybe later, not now, no employees yet, will come back
- "has_system": already uses another system/app/service for this (name it in the note if mentioned)
- "no": just a no / not interested / no thanks, without a reason about another system
- "unsubscribe": asks to be removed or unsubscribed
- "": cannot tell

For each reply also write "note": at most 6 words in Russian summarising it (e.g. "Softone, довольны", "Позвонить в понедельник", "Не интересно").

Return only JSON: {"items":[{"id":"...","category":"...","note":"..."}]}

Replies:
${JSON.stringify(items)}`;
    let out: { items?: { id?: string; category?: string; note?: string }[] };
    try {
      const reply = await callClaude({
        model: process.env.MAILER_REPLY_MODEL || "claude-haiku-5-5",
        maxTokens: 4096,
        content: [{ type: "text", text: prompt }],
      });
      out = parseJsonObject(reply);
    } catch (err) {
      // Still sort the obvious ones, then report why AI failed.
      for (const r of pending) await this.applyGuess(r, "", "");
      throw err;
    }
    const byId = new Map((out.items || []).map((i) => [String(i.id), i]));
    for (const r of pending) {
      const ai = byId.get(String(r._id));
      await this.applyGuess(
        r,
        String(ai?.category ?? ""),
        String(ai?.note ?? ""),
      );
    }
    return pending.length;
  }

  // AI category if valid, else the keyword rules; note only if empty.
  private async applyGuess(
    r: { _id: Types.ObjectId; snippet: string; note: string; email: string },
    aiCategory: string,
    aiNote: string,
  ) {
    let category: ReplyCategory = (
      REPLY_CATEGORIES as readonly string[]
    ).includes(aiCategory)
      ? (aiCategory as ReplyCategory)
      : "";
    if (!category || category === "auto") category = guessCategory(r.snippet);
    const set: Partial<MailReply> = { aiTried: true };
    if (category) set.category = category;
    if (aiNote && !r.note) set.note = aiNote.slice(0, 120);
    await this.replies.updateOne({ _id: r._id, category: "" }, set);
    if (category === "unsubscribe")
      await this.listsService.markEverywhere(r.email, "unsubscribed");
  }
}
