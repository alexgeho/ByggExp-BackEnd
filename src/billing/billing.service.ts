import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import Stripe from "stripe";
import { Company, CompanyDocument } from "../company/schemas/company.schema";
import {
  ACTIVE_STATUSES,
  BillingInterval,
  PLAN_TIERS,
  PlanTier,
  TRIAL_DAYS,
  priceIdFor,
  tierForPriceId,
} from "./plans";

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe | null;

  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
  ) {
    const key = process.env.STRIPE_SECRET_KEY;
    this.stripe = key ? new Stripe(key) : null;
    if (!this.stripe) {
      this.logger.warn(
        "Stripe is not configured (STRIPE_SECRET_KEY missing) — billing endpoints are disabled.",
      );
    }
  }

  isEnabled(): boolean {
    return Boolean(this.stripe);
  }

  private client(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException("Billing is not configured");
    }
    return this.stripe;
  }

  private async getCompany(companyId: string): Promise<CompanyDocument> {
    const company = companyId
      ? await this.companyModel.findById(companyId).exec()
      : null;
    if (!company) throw new NotFoundException("Company not found");
    return company;
  }

  private async ensureCustomer(company: CompanyDocument): Promise<string> {
    if (company.stripeCustomerId) return company.stripeCustomerId;
    const customer = await this.client().customers.create({
      email: company.email || undefined,
      name: company.name || undefined,
      metadata: { companyId: String(company._id) },
    });
    company.stripeCustomerId = customer.id;
    await company.save();
    return customer.id;
  }

  // Hosted Checkout for starting a subscription (Stripe collects the card).
  async createCheckout(
    companyId: string,
    tier: PlanTier,
    interval: BillingInterval,
    appBaseUrl: string,
  ): Promise<{ url: string }> {
    const price = priceIdFor(tier, interval);
    if (!price) {
      throw new BadRequestException("This plan is not configured");
    }
    const company = await this.getCompany(companyId);
    const customer = await this.ensureCustomer(company);

    const taxEnabled = process.env.STRIPE_TAX_ENABLED === "true";
    const session = await this.client().checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price, quantity: 1 }],
      subscription_data: { trial_period_days: TRIAL_DAYS },
      allow_promotion_codes: true,
      billing_address_collection: "required",
      // Let Swedish/EU B2B customers enter their VAT number (reverse charge).
      tax_id_collection: { enabled: true },
      // Stripe Tax computes moms automatically — only when enabled in the
      // dashboard, otherwise checkout would error, so it is behind a flag.
      ...(taxEnabled
        ? {
            automatic_tax: { enabled: true },
            customer_update: { address: "auto", name: "auto" },
          }
        : {}),
      success_url: `${appBaseUrl}/company/billing?checkout=success`,
      cancel_url: `${appBaseUrl}/company/billing?checkout=cancel`,
    });
    if (!session.url) {
      throw new ServiceUnavailableException("Could not start checkout");
    }
    return { url: session.url };
  }

  // Stripe-hosted Customer Portal: cancel, change card, view invoices/receipts.
  async createPortal(
    companyId: string,
    appBaseUrl: string,
  ): Promise<{ url: string }> {
    const company = await this.getCompany(companyId);
    if (!company.stripeCustomerId) {
      throw new BadRequestException("No subscription yet");
    }
    const session = await this.client().billingPortal.sessions.create({
      customer: company.stripeCustomerId,
      return_url: `${appBaseUrl}/company/billing`,
    });
    return { url: session.url };
  }

  // Plans with live prices pulled from Stripe, so the UI can show real amounts.
  async getPlans() {
    if (!this.stripe) return { enabled: false, plans: [] };
    const intervals: BillingInterval[] = ["monthly", "yearly"];
    const plans: Array<{ tier: PlanTier; prices: Record<string, unknown> }> = [];

    for (const tier of PLAN_TIERS) {
      const prices: Record<string, unknown> = {};
      for (const interval of intervals) {
        const id = priceIdFor(tier, interval);
        if (!id) continue;
        try {
          const price = await this.stripe.prices.retrieve(id);
          prices[interval] = {
            priceId: price.id,
            amount: price.unit_amount != null ? price.unit_amount / 100 : null,
            currency: (price.currency || "sek").toUpperCase(),
            interval: price.recurring?.interval ?? null,
          };
        } catch (error) {
          this.logger.warn(
            `Could not load Stripe price ${id}: ${(error as Error)?.message}`,
          );
        }
      }
      if (Object.keys(prices).length) plans.push({ tier, prices });
    }
    return { enabled: true, plans };
  }

  // Lightweight status lookup used by the paywall interceptor (mutations only).
  async getSubscriptionStatus(companyId: string): Promise<string | null> {
    if (!companyId) return null;
    const company = await this.companyModel
      .findById(companyId)
      .select("subscriptionStatus")
      .lean()
      .exec();
    return (company as { subscriptionStatus?: string } | null)?.subscriptionStatus ?? null;
  }

  async getStatus(companyId: string) {
    const company = await this.getCompany(companyId);
    const status = company.subscriptionStatus ?? null;
    return {
      enabled: this.isEnabled(),
      plan: company.plan ?? null,
      status,
      active: Boolean(status && ACTIVE_STATUSES.has(status)),
      trialEndsAt: company.trialEndsAt ?? null,
      currentPeriodEnd: company.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: Boolean(company.cancelAtPeriodEnd),
      hasCustomer: Boolean(company.stripeCustomerId),
    };
  }

  // Verify a webhook payload against the signing secret.
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException("Webhook secret not configured");
    }
    return this.client().webhooks.constructEvent(rawBody, signature, secret);
  }

  async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await this.syncSubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  }

  // Mirror the subscription's current state onto the company record.
  private async syncSubscription(sub: Stripe.Subscription): Promise<void> {
    const customerId = String(sub.customer);
    const company = await this.companyModel
      .findOne({ stripeCustomerId: customerId })
      .exec();
    if (!company) {
      this.logger.warn(`Webhook for unknown Stripe customer ${customerId}`);
      return;
    }

    const priceId = sub.items?.data?.[0]?.price?.id;
    const tier = priceId ? tierForPriceId(priceId) : null;
    const status = sub.status;
    const periodEnd = (sub as unknown as { current_period_end?: number })
      .current_period_end;

    company.subscriptionStatus = status;
    company.plan = ACTIVE_STATUSES.has(status) ? tier : null;
    company.cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
    company.currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : null;
    company.trialEndsAt = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
    company.stripeSubscriptionId = status === "canceled" ? null : sub.id;

    await company.save();
    this.logger.log(
      `Subscription ${sub.id} for company ${company._id} → ${status} (${tier ?? "no plan"})`,
    );
  }
}
