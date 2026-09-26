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

// ---------- settings (singleton) ----------

export type MailerSettingsDocument = MailerSettings & Document;

@Schema({ timestamps: true })
export class MailerSettings {
  @Prop({ default: "main" })
  key: string;

  @Prop({ default: "" })
  smtpHost: string;

  @Prop({ default: 587 })
  smtpPort: number;

  @Prop({ default: "" })
  smtpUser: string;

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
}
export const MailerSettingsSchema =
  SchemaFactory.createForClass(MailerSettings);
