import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type CompanyDocument = Company & Document;

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
}

export const CompanySchema = SchemaFactory.createForClass(Company);
