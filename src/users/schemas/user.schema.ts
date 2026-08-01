import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type UserDocument = User & Document;

// Employee certificate / behörighet with an expiry the admin gets reminded about.
@Schema({ timestamps: true })
export class Certificate {
  @Prop({ required: true })
  name: string;

  @Prop({ default: "" })
  number?: string;

  @Prop({ default: "" })
  issuer?: string;

  @Prop({ type: Date, default: null })
  issuedAt?: Date | null;

  @Prop({ type: Date, default: null })
  expiresAt?: Date | null;

  @Prop({ default: "" })
  fileUrl?: string;

  @Prop({ default: "" })
  notes?: string;

  // Last reminder milestone sent (30/14/7/1/0 days, or -1 = expired). Prevents
  // sending the same reminder twice; reset to null when the cert is far out again.
  @Prop({ type: Number, default: null })
  lastReminderBucket?: number | null;
}

export const CertificateSchema = SchemaFactory.createForClass(Certificate);

export enum UserRole {
  SuperAdmin = "superadmin",
  CompanyAdmin = "companyAdmin",
  ProjectAdmin = "projectAdmin",
  Worker = "worker",
}

export enum UserWorkStatus {
  OffDuty = "off_duty",
  Working = "working",
  OutsideProjectArea = "outside_project_area",
}

export enum UserAccountStatus {
  WaitingForApproval = "waiting_for_approval",
  Active = "active",
}

export type UserNotificationPreferences = {
  flowMode: boolean;
  messages: boolean;
  tasks: boolean;
  productAndMarketingAlerts: boolean;
};

export const DEFAULT_USER_NOTIFICATION_PREFERENCES: UserNotificationPreferences =
  {
    flowMode: true,
    messages: true,
    tasks: true,
    productAndMarketingAlerts: true,
  };

export const normalizeUserNotificationPreferences = (
  value?: Partial<UserNotificationPreferences> | null,
): UserNotificationPreferences => ({
  flowMode:
    typeof value?.flowMode === "boolean"
      ? value.flowMode
      : DEFAULT_USER_NOTIFICATION_PREFERENCES.flowMode,
  messages:
    typeof value?.messages === "boolean"
      ? value.messages
      : DEFAULT_USER_NOTIFICATION_PREFERENCES.messages,
  tasks:
    typeof value?.tasks === "boolean"
      ? value.tasks
      : DEFAULT_USER_NOTIFICATION_PREFERENCES.tasks,
  productAndMarketingAlerts:
    typeof value?.productAndMarketingAlerts === "boolean"
      ? value.productAndMarketingAlerts
      : DEFAULT_USER_NOTIFICATION_PREFERENCES.productAndMarketingAlerts,
});

@Schema({ timestamps: true })
export class User {
  // Email is the login identifier, but it is unique PER COMPANY, not globally
  // (see the compound index below). Do not add `unique: true` here.
  @Prop({ required: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ type: Number, default: null })
  phoneAreaCode?: number | null;

  @Prop({ type: Number, default: null })
  phoneNumber?: number | null;

  @Prop({ default: "" })
  name: string;

  @Prop({ default: "" })
  profession: string;

  // Hourly wage in SEK, used by the payroll module to turn worked hours into a
  // salary amount. Null until an admin sets it.
  @Prop({ type: Number, default: null })
  hourlyRate?: number | null;

  // Skatteverket tax table (tabellnr, e.g. 31) and column (1–6) for preliminary
  // tax in payroll. Null → payroll falls back to a flat percentage.
  @Prop({ type: Number, default: null })
  taxTable?: number | null;

  @Prop({ type: Number, default: null })
  taxColumn?: number | null;

  // Swedish personnummer / samordningsnummer. Sensitive PII, stored only to
  // build the legally required electronic personalliggare (attendance log).
  @Prop({ default: "" })
  personalNumber?: string;

  @Prop({ default: "" })
  avatarUrl: string;

  // Employee certificates / behörigheter (Heta arbeten, ID06, …) with expiry.
  @Prop({ type: [CertificateSchema], default: [] })
  certificates: Certificate[];

  // Set when the user's personal data has been erased on a GDPR request. The
  // record is kept (de-identified) so references from retained data stay valid.
  @Prop({ type: Date, default: null })
  erasedAt?: Date | null;

  @Prop({ type: Object, default: { ru: "Русский" } })
  language: Record<string, any>;

  @Prop({ type: [String], default: [] })
  additionalDocuments: string[];

  @Prop({ required: true, enum: UserRole, default: UserRole.Worker })
  role: UserRole;

  @Prop({
    required: true,
    enum: UserAccountStatus,
    default: UserAccountStatus.Active,
    index: true,
  })
  accountStatus: UserAccountStatus;

  @Prop({ type: String, default: null, select: false })
  emailVerificationToken?: string | null;

  @Prop({ type: Date, default: null, select: false })
  emailVerificationExpiresAt?: Date | null;

  @Prop({ type: String, default: null, select: false })
  magicLoginCode?: string | null;

  @Prop({ type: Date, default: null, select: false })
  magicLoginExpiresAt?: Date | null;

  @Prop({ type: String, ref: "Company", default: null })
  companyId: string | null;

  @Prop({ type: [String], ref: "Project", default: [] })
  projectIds: string[];

  @Prop({
    required: true,
    enum: UserWorkStatus,
    default: UserWorkStatus.OffDuty,
    index: true,
  })
  workStatus: UserWorkStatus;

  @Prop({ type: String, ref: "Project", default: null })
  workStatusProjectId?: string | null;

  @Prop({ default: "" })
  workStatusProjectName?: string;

  @Prop({ type: String, ref: "Shift", default: null })
  workStatusShiftId?: string | null;

  @Prop({ default: "" })
  workStatusReason?: string;

  @Prop({ type: Date, default: null })
  workStatusUpdatedAt?: Date | null;

  // Last time the worker's device was seen (heartbeat from the mobile app while
  // a shift is active). Used to flag "offline / last seen Xm" and to auto-close
  // shifts left running after the phone went silent.
  @Prop({ type: Date, default: null })
  lastSeenAt?: Date | null;

  @Prop({
    type: Object,
    default: () => ({ ...DEFAULT_USER_NOTIFICATION_PREFERENCES }),
  })
  notificationPreferences: UserNotificationPreferences;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Email is unique PER COMPANY, not globally: the same person can hold separate
// accounts at different companies (e.g. after changing employer, where the
// companies don't know about each other). Login disambiguates by matching the
// password across the accounts that share an email (see findAllByEmail).
// The partial filter only enforces uniqueness for real companies (companyId is
// a string); company-less accounts (superadmin, pending signups) are not
// constrained here.
// NOTE: the legacy global `email_1` unique index must be dropped in the
// database for this to take effect — Mongoose does not drop it automatically.
UserSchema.index(
  { companyId: 1, email: 1 },
  { unique: true, partialFilterExpression: { companyId: { $type: "string" } } },
);
