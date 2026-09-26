import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { isValidObjectId, Model, Types } from "mongoose";
import {
  checkDomain,
  isValidEmailSyntax,
  normalizeEmail,
} from "./mailer-personalize";
import {
  MailingList,
  MailingListDocument,
  Subscriber,
  SubscriberDocument,
  SUBSCRIBER_STATUSES,
  SubscriberStatus,
  Suppression,
  SuppressionDocument,
} from "./schemas/mailer.schemas";

export type ImportRow = {
  email?: unknown;
  name?: unknown;
  company?: unknown;
  city?: unknown;
};

const str = (v: unknown, max = 200) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
const oid = (id: string) => {
  if (!isValidObjectId(id)) throw new NotFoundException("Not found");
  return new Types.ObjectId(id);
};
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

@Injectable()
export class MailerListsService {
  constructor(
    @InjectModel(MailingList.name)
    private readonly lists: Model<MailingListDocument>,
    @InjectModel(Subscriber.name)
    private readonly subs: Model<SubscriberDocument>,
    @InjectModel(Suppression.name)
    private readonly suppressions: Model<SuppressionDocument>,
  ) {}

  // ---------- lists ----------

  async listLists() {
    const [lists, counts] = await Promise.all([
      this.lists.find().sort({ createdAt: -1 }).lean(),
      this.subs.aggregate<{
        _id: { listId: Types.ObjectId; status: string };
        n: number;
      }>([
        {
          $group: {
            _id: { listId: "$listId", status: "$status" },
            n: { $sum: 1 },
          },
        },
      ]),
    ]);
    return lists.map((l) => {
      const mine = counts.filter((c) => String(c._id.listId) === String(l._id));
      const by = (s: string) => mine.find((c) => c._id.status === s)?.n ?? 0;
      return {
        ...l,
        total: mine.reduce((a, c) => a + c.n, 0),
        active: by("active"),
        unsubscribed: by("unsubscribed"),
        bounced: by("bounced") + by("complained"),
      };
    });
  }

  async getList(id: string) {
    const list = await this.lists.findById(oid(id)).lean();
    if (!list) throw new NotFoundException("List not found");
    return list;
  }

  createList(name: string, description = "") {
    if (!str(name)) throw new BadRequestException("Namn krävs");
    return this.lists.create({
      name: str(name, 120),
      description: str(description, 500),
    });
  }

  async updateList(id: string, patch: { name?: string; description?: string }) {
    await this.getList(id);
    const set: Record<string, string> = {};
    if (patch.name !== undefined && str(patch.name))
      set.name = str(patch.name, 120);
    if (patch.description !== undefined)
      set.description = str(patch.description, 500);
    return this.lists.findByIdAndUpdate(id, set, { new: true }).lean();
  }

  async deleteList(id: string) {
    await this.getList(id);
    await this.subs.deleteMany({ listId: oid(id) });
    await this.lists.deleteOne({ _id: oid(id) });
    return { deleted: true };
  }

  // ---------- subscribers ----------

  async listSubscribers(q: {
    listId?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const filter: Record<string, unknown> = {};
    if (q.listId) filter.listId = oid(q.listId);
    if (
      q.status &&
      (SUBSCRIBER_STATUSES as readonly string[]).includes(q.status)
    )
      filter.status = q.status;
    if (q.search) {
      const re = new RegExp(escapeRegex(str(q.search, 100)), "i");
      filter.$or = [{ email: re }, { name: re }, { company: re }, { city: re }];
    }
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
    const page = Math.max(1, Number(q.page) || 1);
    const [items, total] = await Promise.all([
      this.subs
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.subs.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  async addSubscriber(listId: string, row: ImportRow) {
    const res = await this.importRows(listId, [row], "manual");
    if (res.invalid) throw new BadRequestException("Ogiltig e-postadress");
    if (res.alreadyInList)
      throw new BadRequestException("Adressen finns redan i listan");
    return res;
  }

  async updateSubscriber(
    id: string,
    patch: {
      name?: string;
      company?: string;
      city?: string;
      status?: SubscriberStatus;
    },
  ) {
    const sub = await this.subs.findById(oid(id));
    if (!sub) throw new NotFoundException("Subscriber not found");
    if (patch.name !== undefined) sub.name = str(patch.name);
    if (patch.company !== undefined) sub.company = str(patch.company);
    if (patch.city !== undefined) sub.city = str(patch.city);
    if (
      patch.status &&
      (SUBSCRIBER_STATUSES as readonly string[]).includes(patch.status)
    ) {
      sub.status = patch.status;
      // Re-activating an address is an explicit admin decision: lift the block.
      if (patch.status === "active")
        await this.suppressions.deleteOne({ email: sub.email });
      else await this.suppress(sub.email, patch.status);
    }
    await sub.save();
    return sub.toObject();
  }

  async deleteSubscribers(ids: string[]) {
    const valid = ids
      .filter((id) => isValidObjectId(id))
      .map((id) => new Types.ObjectId(id));
    const r = await this.subs.deleteMany({ _id: { $in: valid } });
    return { deleted: r.deletedCount };
  }

  // Bulk import (CSV/Excel rows parsed in the browser). Existing addresses in
  // the list get their empty fields filled in; suppressed addresses are kept
  // but marked with their suppression status so they're never mailed.
  async importRows(listId: string, rows: ImportRow[], source = "import") {
    await this.getList(listId);
    const listOid = oid(listId);
    const seen = new Set<string>();
    const valid: {
      email: string;
      name: string;
      company: string;
      city: string;
    }[] = [];
    let invalid = 0;
    let duplicates = 0;
    for (const row of rows.slice(0, 20000)) {
      const email = normalizeEmail(row.email);
      if (!isValidEmailSyntax(email)) {
        invalid++;
        continue;
      }
      if (seen.has(email)) {
        duplicates++;
        continue;
      }
      seen.add(email);
      valid.push({
        email,
        name: str(row.name),
        company: str(row.company),
        city: str(row.city),
      });
    }

    const emails = valid.map((v) => v.email);
    const [existing, suppressed] = await Promise.all([
      this.subs
        .find({ listId: listOid, email: { $in: emails } }, { email: 1 })
        .lean(),
      this.suppressions.find({ email: { $in: emails } }).lean(),
    ]);
    const existingSet = new Set(existing.map((e) => e.email));
    const suppressedMap = new Map(suppressed.map((s) => [s.email, s.reason]));

    const toInsert = valid
      .filter((v) => !existingSet.has(v.email))
      .map((v) => {
        const reason = suppressedMap.get(v.email);
        const status: SubscriberStatus =
          reason === "bounced" || reason === "complained"
            ? reason
            : reason
              ? "unsubscribed"
              : "active";
        return { ...v, listId: listOid, status, source };
      });
    if (toInsert.length)
      await this.subs.insertMany(toInsert, { ordered: false });

    // Fill blanks on addresses that were already in the list.
    const updates = valid.filter((v) => existingSet.has(v.email));
    for (const v of updates) {
      const set: Record<string, string> = {};
      if (v.name) set.name = v.name;
      if (v.company) set.company = v.company;
      if (v.city) set.city = v.city;
      if (Object.keys(set).length)
        await this.subs.updateOne(
          { listId: listOid, email: v.email },
          { $set: set },
        );
    }

    return {
      added: toInsert.length,
      alreadyInList: updates.length,
      invalid,
      duplicates,
      suppressed: toInsert.filter((t) => t.status !== "active").length,
    };
  }

  // "Kontrollera": MX lookup per unique domain for not-yet-verified addresses.
  async verifyList(listId: string) {
    const listOid = oid(listId);
    const pending = await this.subs
      .find({ listId: listOid, verified: "unknown" }, { email: 1 })
      .lean();
    const domains = [...new Set(pending.map((p) => p.email.split("@")[1]))];
    const result = new Map<string, { ok: boolean; note: string }>();
    const queue = [...domains];
    await Promise.all(
      Array.from({ length: 10 }, async () => {
        for (let d = queue.shift(); d; d = queue.shift())
          result.set(d, await checkDomain(d));
      }),
    );
    let valid = 0;
    let invalid = 0;
    for (const [domain, r] of result) {
      if (r.note === "dns-unavailable") continue; // leave as unknown, retry later
      const re = new RegExp(`@${escapeRegex(domain)}$`);
      const u = await this.subs.updateMany(
        { listId: listOid, verified: "unknown", email: re },
        { $set: { verified: r.ok ? "valid" : "invalid", verifyNote: r.note } },
      );
      if (r.ok) valid += u.modifiedCount;
      else invalid += u.modifiedCount;
    }
    return { checked: pending.length, valid, invalid };
  }

  // ---------- suppression ----------

  async suppress(email: string, reason: string) {
    await this.suppressions.updateOne(
      { email: normalizeEmail(email) },
      { $set: { reason } },
      { upsert: true },
    );
  }

  async isSuppressed(email: string) {
    return Boolean(
      await this.suppressions.exists({ email: normalizeEmail(email) }),
    );
  }

  // Unsubscribe/bounce applies to the address on every list.
  async markEverywhere(email: string, status: SubscriberStatus) {
    await this.suppress(email, status);
    await this.subs.updateMany(
      { email: normalizeEmail(email) },
      { $set: { status } },
    );
  }

  activeSubscribers(listId: string) {
    return this.subs
      .find({
        listId: oid(listId),
        status: "active",
        verified: { $ne: "invalid" },
      })
      .lean();
  }

  async suppressedSet(emails: string[]) {
    const found = await this.suppressions
      .find({ email: { $in: emails } }, { email: 1 })
      .lean();
    return new Set(found.map((f) => f.email));
  }

  markSent(ids: Types.ObjectId[]) {
    return this.subs.updateMany(
      { _id: { $in: ids } },
      { $set: { lastSentAt: new Date() } },
    );
  }
}
