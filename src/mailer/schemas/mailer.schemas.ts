import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema, Types } from "mongoose";

// ByggExp's own marketing mailer (superadmin only): lists of subscribers,
// campaigns that send a newsletter design to a list, and an event log.

// ---------- lists ----------

export type MailingListDocument = MailingList & Document;

@Schema({ timestamps: true })
export class MailingList {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: "" })
  description: string;
}
export const MailingListSchema = SchemaFactory.createForClass(MailingList);

// ---------- subscribers ----------

export const SUBSCRIBER_STATUSES = [
  "active",
  "unsubscribed",
  "bounced",
  "complained",
] as const;
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];

export const VERIFY_STATES = ["unknown", "valid", "invalid"] as const;
export type VerifyState = (typeof VERIFY_STATES)[number];

export type SubscriberDocument = Subscriber & Document;

@Schema({ timestamps: true })
export class Subscriber {
  @Prop({
    type: Types.ObjectId,
    ref: "MailingList",
    required: true,
    index: true,
  })
  listId: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ default: "" })
  name: string;

  @Prop({ default: "" })
  company: string;

  @Prop({ default: "" })
  city: string;

  @Prop({
    type: String,
    enum: SUBSCRIBER_STATUSES,
    default: "active",
    index: true,
  })
  status: SubscriberStatus;

  // "Kontrollerad": syntax + the domain has MX records.
  @Prop({ type: String, enum: VERIFY_STATES, default: "unknown" })
  verified: VerifyState;

  @Prop({ default: "" })
  verifyNote: string;

  @Prop({ default: "" })
  source: string;

  @Prop({ type: Date, default: null })
  lastSentAt: Date | null;
}
export const SubscriberSchema = SchemaFactory.createForClass(Subscriber);
SubscriberSchema.index({ listId: 1, email: 1 }, { unique: true });
SubscriberSchema.index({ email: 1 });

// Global do-not-mail list. Anyone here is skipped by every campaign, on every
// list — an unsubscribe must stick even if the address is re-imported.
export type SuppressionDocument = Suppression & Document;

@Schema({ timestamps: true })
export class Suppression {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ type: String, default: "unsubscribed" })
  reason: string;
}
export const SuppressionSchema = SchemaFactory.createForClass(Suppression);

// ---------- campaigns ----------

export const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "sending",
  "paused",
  "completed",
  "cancelled",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export type CampaignDocument = Campaign & Document;

@Schema({ timestamps: true })
export class Campaign {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: "Newsletter", default: null })
  newsletterId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: "MailingList", default: null })
  listId: Types.ObjectId | null;

  @Prop({ default: "" })
  subject: string;

  @Prop({
    type: String,
    enum: CAMPAIGN_STATUSES,
    default: "draft",
    index: true,
  })
  status: CampaignStatus;

  @Prop({ type: Date, default: null })
  scheduledAt: Date | null;

  @Prop({ type: Date, default: null })
  startedAt: Date | null;

  @Prop({ type: Date, default: null })
  completedAt: Date | null;

  // Content frozen when sending starts, so later edits to the design don't
  // change a mailing that is half-way out.
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  snapshot: { settings: unknown; blocks: unknown } | null;

  @Prop({
    type: MongooseSchema.Types.Mixed,
    default: () => ({
      total: 0,
      sent: 0,
      failed: 0,
      opened: 0,
      clicked: 0,
      unsubscribed: 0,
      bounced: 0,
    }),
  })
  stats: {
    total: number;
    sent: number;
    failed: number;
    opened: number;
    clicked: number;
    unsubscribed: number;
    bounced: number;
  };

  @Prop({ default: "" })
  lastError: string;

  // Which sender profile (MailerSettings.key) the campaign goes out from.
  @Prop({ default: "main" })
  senderKey: string;

  // Rotate through several sender profiles (mailboxes) — each keeps its own
  // warm-up cap, so volume scales with the number of mailboxes. Empty = only
  // senderKey (older campaigns).
  @Prop({ type: [String], default: [] })
  senderKeys: string[];
}
export const CampaignSchema = SchemaFactory.createForClass(Campaign);

export const RECIPIENT_STATUSES = [
  "queued",
  "sending",
  "sent",
  "failed",
] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

export type CampaignRecipientDocument = CampaignRecipient & Document;

@Schema({ timestamps: true })
export class CampaignRecipient {
  @Prop({ type: Types.ObjectId, ref: "Campaign", required: true })
  campaignId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "Subscriber", default: null })
  subscriberId: Types.ObjectId | null;

  @Prop({ required: true, lowercase: true })
  email: string;

  @Prop({ default: "" })
  name: string;

  @Prop({ default: "" })
  company: string;

  // Opaque id used in tracking / unsubscribe links.
  @Prop({ required: true, unique: true })
  token: string;

  @Prop({ type: String, enum: RECIPIENT_STATUSES, default: "queued" })
  status: RecipientStatus;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ default: "" })
  error: string;

  @Prop({ type: Date, default: null })
  sentAt: Date | null;

  @Prop({ type: Date, default: null })
  openedAt: Date | null;

  @Prop({ default: 0 })
  opens: number;

  @Prop({ type: Date, default: null })
  clickedAt: Date | null;

  @Prop({ default: 0 })
  clicks: number;
}
export const CampaignRecipientSchema =
  SchemaFactory.createForClass(CampaignRecipient);
CampaignRecipientSchema.index({ campaignId: 1, status: 1 });

// ---------- event log ("Realtidslogg") ----------

export const EVENT_TYPES = [
  "sent",
  "failed",
  "open",
  "click",
  "unsubscribe",
  "bounce",
  "reply",
  "test",
] as const;
export type MailEventType = (typeof EVENT_TYPES)[number];

export type MailEventDocument = MailEvent & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class MailEvent {
  @Prop({ type: String, enum: EVENT_TYPES, required: true })
  type: MailEventType;

  @Prop({ type: Types.ObjectId, ref: "Campaign", default: null, index: true })
  campaignId: Types.ObjectId | null;

  @Prop({ default: "" })
  email: string;

  @Prop({ default: "" })
  detail: string;
}
export const MailEventSchema = SchemaFactory.createForClass(MailEvent);
MailEventSchema.index({ createdAt: -1 });
MailEventSchema.index({ campaignId: 1, email: 1, type: 1 });

// ---------- settings: one doc per sender profile ("main" = ByggExp) ----------

export type MailerSettingsDocument = MailerSettings & Document;

@Schema({ timestamps: true })
export class MailerSettings {
  @Prop({ default: "main" })
  key: string;

  // Name shown in the admin when picking a sender for a campaign.
  @Prop({ default: "" })
  label: string;

  @Prop({ default: "" })
  smtpHost: string;

  @Prop({ default: 587 })
  smtpPort: number;

  @Prop({ default: "" })
  smtpUser: string;

  // Use the SMTP account (host/port/login/password) of another sender profile,
  // e.g. a second Brevo "from" domain on the same Brevo key. "" = own account.
  @Prop({ default: "" })
  smtpShareKey: string;

  // AES-256-GCM, see mailer-crypto.ts. Never returned by the API.
  @Prop({ default: "" })
  smtpPassEnc: string;

  @Prop({ default: "ByggExp" })
  fromName: string;

  @Prop({ default: "" })
  fromEmail: string;

  @Prop({ default: "" })
  replyTo: string;

  // Throttle: keeps a young sending domain out of spam folders.
  @Prop({ default: 100 })
  ratePerHour: number;

  @Prop({ default: true })
  trackOpens: boolean;

  @Prop({ default: true })
  trackClicks: boolean;

  // ----- warm-up: daily cap that grows every day on a young sending domain -----
  @Prop({ default: false })
  warmupEnabled: boolean;

  @Prop({ type: Date, default: null })
  warmupStartedAt: Date | null;

  @Prop({ default: 20 })
  warmupStartPerDay: number;

  // Daily growth of the cap in percent (20–30 % is the usual safe pace).
  @Prop({ default: 25 })
  warmupGrowthPct: number;

  @Prop({ default: 300 })
  warmupTargetPerDay: number;

  // ----- send window: business hours in Sweden, like a person would send -----
  @Prop({ default: false })
  sendWindowEnabled: boolean;

  @Prop({ default: 8 })
  sendHourFrom: number;

  @Prop({ default: 17 })
  sendHourTo: number;

  @Prop({ default: true })
  weekdaysOnly: boolean;

  // Pause a campaign when its hard-bounce rate goes above this (percent).
  @Prop({ default: 5 })
  maxBounceRatePct: number;

  // Mails sent today (Stockholm date) by this sender — for the daily cap.
  @Prop({ default: "" })
  dailyDate: string;

  @Prop({ default: 0 })
  dailySent: number;
}
export const MailerSettingsSchema =
  SchemaFactory.createForClass(MailerSettings);

// ---------- funnel: replies from the inbox + share link ----------

// What a reply means for the funnel. "" = not classified yet; "auto" =
// out-of-office / auto-reply (not counted as a reply).
export const REPLY_CATEGORIES = [
  "",
  "interest",
  "later",
  "has_system",
  "no",
  "unsubscribe",
  "auto",
] as const;
export type ReplyCategory = (typeof REPLY_CATEGORIES)[number];

export type MailReplyDocument = MailReply & Document;

@Schema({ timestamps: true })
export class MailReply {
  // Message-ID of the reply — one row per mail, however often we sync.
  @Prop({ required: true, unique: true })
  messageId: string;

  @Prop({ type: Types.ObjectId, ref: "Campaign", default: null, index: true })
  campaignId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: "CampaignRecipient", default: null })
  recipientId: Types.ObjectId | null;

  @Prop({ default: "", lowercase: true })
  email: string;

  @Prop({ default: "" })
  name: string;

  @Prop({ default: "" })
  company: string;

  @Prop({ default: "" })
  subject: string;

  // First lines of the reply, quoted original stripped.
  @Prop({ default: "" })
  snippet: string;

  @Prop({ type: Date, default: null })
  receivedAt: Date | null;

  @Prop({ type: String, enum: REPLY_CATEGORIES, default: "" })
  category: ReplyCategory;

  @Prop({ default: "" })
  note: string;

  // Claude has tried to classify it (once — manual edits always win).
  @Prop({ default: false })
  aiTried: boolean;
}
export const MailReplySchema = SchemaFactory.createForClass(MailReply);

// One doc ("main"): the IMAP inbox replies land in + the public share token.
export type MailerFunnelConfigDocument = MailerFunnelConfig & Document;

@Schema({ timestamps: true })
export class MailerFunnelConfig {
  @Prop({ default: "main", unique: true })
  key: string;

  @Prop({ default: "" })
  imapHost: string;

  @Prop({ default: 993 })
  imapPort: number;

  @Prop({ default: "" })
  imapUser: string;

  // AES-256-GCM, see mailer-crypto.ts. Never returned by the API.
  @Prop({ default: "" })
  imapPassEnc: string;

  // Highest INBOX UID already read; UIDVALIDITY resets it.
  @Prop({ default: 0 })
  lastUid: number;

  @Prop({ default: "" })
  uidValidity: string;

  @Prop({ type: Date, default: null })
  lastSyncAt: Date | null;

  @Prop({ default: "" })
  lastError: string;

  // Read-only public funnel link (/m/funnel/:token). "" = sharing off.
  @Prop({ default: "" })
  shareToken: string;
}
export const MailerFunnelConfigSchema =
  SchemaFactory.createForClass(MailerFunnelConfig);
