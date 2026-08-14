import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type CompanyDocument = Company & Document;

// Shift-anchored "log your hours" rule (fired by the hours-reminders cron).
// The reminder is tied to each project's scheduled shift end — not a fixed
// company-wide time — and repeats/escalates like a task reminder.
@Schema({ _id: false })
export class HoursReminderRule {
  @Prop({ type: Boolean, default: false })
  enabled: boolean;

  // Start reminding this many minutes after the scheduled shift end.
  @Prop({ type: Number, default: 15 })
  startDelayMinutes: number;

  // Repeat every N minutes until the worker reports hours (15/30/60…).
  @Prop({ type: Number, default: 15 })
  intervalMinutes: number;

  // Stop after N reminders. 0 = keep reminding until reported.
  @Prop({ type: Number, default: 0 })
  maxReminders: number;

  // Also notify the boss (project manager + owner) after N reminders.
  // 0 = never escalate.
  @Prop({ type: Number, default: 3 })
  escalateAfterReminders: number;

  // ISO weekdays that count as shift days (1=Mon…7=Sun). Default Mon–Fri.
  @Prop({ type: [Number], default: [1, 2, 3, 4, 5] })
  workingWeekdays: number[];
}

export const HoursReminderRuleSchema =
  SchemaFactory.createForClass(HoursReminderRule);

@Schema({ timestamps: true })
export class Company {
  @Prop({ default: "" })
  name: string;

  @Prop({ default: "" })
  address: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ default: "" })
  city: string;

  @Prop({ default: "" })
  phone: string;

  @Prop({ default: "" })
  website: string;

  @Prop({ default: "" })
  orgNumber: string;

  @Prop({ default: "" })
  vatNumber: string;

  @Prop({ default: "" })
  vatStatus: string;

  // Relative URL under /uploads (e.g. /uploads/company-logos/xyz.png); shown on
  // invoice/offer PDFs as the sender logo.
  @Prop({ default: "" })
  logoUrl: string;

  @Prop({ type: [String], ref: "User", default: [] })
  companyAdmins: string[];

  @Prop({ type: [String], ref: "Project", default: [] })
  projects: string[];

  // ---- Billing / subscription (Stripe) ----
  @Prop({ type: String, default: null, index: true })
  stripeCustomerId?: string | null;

  @Prop({ type: String, default: null })
  stripeSubscriptionId?: string | null;

  // "basic" | "pro" | null — the tier the active subscription maps to.
  @Prop({ type: String, default: null })
  plan?: string | null;

  // Stripe subscription status: trialing | active | past_due | canceled |
  // incomplete | unpaid | null (never subscribed).
  @Prop({ type: String, default: null, index: true })
  subscriptionStatus?: string | null;

  @Prop({ type: Date, default: null })
  trialEndsAt?: Date | null;

  // Seat limit for the current plan/trial (e.g. 10 on the minimum package).
  // null = unlimited. Enforced when an admin adds users.
  @Prop({ type: Number, default: null })
  maxUsers?: number | null;

  @Prop({ type: Date, default: null })
  currentPeriodEnd?: Date | null;

  @Prop({ type: Boolean, default: false })
  cancelAtPeriodEnd: boolean;

  // ---- Module visibility (feature flags) ----
  // Superadmin overrides on top of the plan preset: { moduleKey: true|false }.
  // Absent key → inherit the plan default. See company/modules.ts.
  @Prop({ type: Object, default: {} })
  moduleOverrides?: Record<string, boolean>;

  // ---- Hours reminder (daily "log your hours" nudge to workers) ----
  @Prop({ type: HoursReminderRuleSchema, default: () => ({}) })
  hoursReminderRule?: HoursReminderRule;
}

export const CompanySchema = SchemaFactory.createForClass(Company);
