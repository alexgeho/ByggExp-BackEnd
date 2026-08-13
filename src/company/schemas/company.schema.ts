import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type CompanyDocument = Company & Document;

// Recurring "workers, log your hours" rule (fired by the hours-reminders cron).
@Schema({ _id: false })
export class HoursReminderRule {
  @Prop({ type: Boolean, default: false })
  enabled: boolean;

  // "HH:MM" 24h — the cron matches the hour in Europe/Stockholm.
  @Prop({ default: "17:00" })
  timeOfDay: string;

  // ISO weekdays to fire on (1=Mon…7=Sun). Default Mon–Fri.
  @Prop({ type: [Number], default: [1, 2, 3, 4, 5] })
  weekdays: number[];

  // Only ping workers who have not reported hours for today.
  @Prop({ type: Boolean, default: true })
  onlyMissing: boolean;

  // Server-managed: last time this rule fired (dedupes within a day).
  @Prop({ type: Date, default: null })
  lastSentAt?: Date | null;
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
