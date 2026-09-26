import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import Stripe from "stripe";
import { cronsDisabled } from "../common/cron.util";
import { Company, CompanyDocument } from "../company/schemas/company.schema";
import { Shift, ShiftDocument } from "../shifts/schemas/shift.schema";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import {
  ACTIVE_STATUSES,
  ACTIVE_WORKER_WINDOW_DAYS,
  ADDONS,
  Addon,
  BillingInterval,
  INCLUDED_SEATS,
  PLAN_TIERS,
  PlanTier,
  TRIAL_DAYS,
  addonPriceIdFor,
  isPerSeat,
  maxUsersForPlan,
  priceIdFor,
  quantityFor,
  tierForPriceId,
} from "./plans";

type PriceInfo = {
  priceId: string;
  currency: string;
  interval: string | null;
  // Flat amount (faktura, add-ons) or the base fee of a per-seat price.
  amount: number | null;
  // Per-seat prices only: users included in the base fee and the fee per extra.
  includedSeats?: number | null;
  perSeat?: number | null;
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe | null;
  private syncing = false;

  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Shift.name)
    private readonly shiftModel: Model<ShiftDocument>,
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

  // Billable seats: office roles (admins, project admins) always count; workers
  // — who mostly just clock in via the app — count only if they clocked in
  // within the last ACTIVE_WORKER_WINDOW_DAYS. GDPR-erased tombstones never count.
  async countBillableSeats(companyId: string): Promise<number> {
    const users = await this.userModel
      .find({ companyId, erasedAt: null })
      .select("_id role")
      .lean()
      .exec();
    const office = users.filter((u) => u.role !== UserRole.Worker).length;
    const workerIds = users
      .filter((u) => u.role === UserRole.Worker)
      .map((u) => String(u._id));
    if (!workerIds.length) return office;

    const since = new Date(
      Date.now() - ACTIVE_WORKER_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const active = await this.shiftModel
      .distinct("workerId", {
        workerId: { $in: workerIds },
        startedAt: { $gte: since },
      })
      .exec();
    return office + active.length;
  }

  // Hosted Checkout for starting a subscription (Stripe collects the card).
  async createCheckout(
    companyId: string,
    tier: PlanTier,
    interval: BillingInterval,
    appBaseUrl: string,
    addons: Addon[] = [],
  ): Promise<{ url: string }> {
    const price = priceIdFor(tier, interval);
    if (!price) {
      throw new BadRequestException("This plan is not configured");
    }
    const addonItems = addons.map((addon) => {
      const id = addonPriceIdFor(addon, interval);
      if (!id)
        throw new BadRequestException(`Add-on ${addon} is not configured`);
      return { price: id, quantity: 1 };
    });

    const company = await this.getCompany(companyId);
    const customer = await this.ensureCustomer(company);
    const seats = isPerSeat(tier)
      ? await this.countBillableSeats(String(company._id))
      : 1;

    const taxEnabled = process.env.STRIPE_TAX_ENABLED === "true";
    const session = await this.client().checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [
        { price, quantity: quantityFor(tier, seats) },
        ...addonItems,
      ],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: { companyId: String(company._id), tier },
      },
      allow_promotion_codes: true,
      billing_address_collection: "required",
      // Let Swedish/EU B2B customers enter their VAT number (reverse charge).
      tax_id_collection: { enabled: true },
      // Required with an existing customer: tax-ID collection must be allowed
      // to write the business name (and address) back, or Stripe rejects it.
      customer_update: { address: "auto", name: "auto" },
      // Stripe Tax computes moms automatically — only when enabled in the
      // dashboard, otherwise checkout would error, so it is behind a flag.
      ...(taxEnabled ? { automatic_tax: { enabled: true } } : {}),
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

  // Reads a Stripe price into the shape the admin UI shows. Graduated tiered
  // prices expose the first tier's flat fee as the base amount.
  private async loadPrice(id: string): Promise<PriceInfo | null> {
    if (!this.stripe) return null;
    try {
      const price = await this.stripe.prices.retrieve(id, {
        expand: ["tiers"],
      });
      const base: PriceInfo = {
        priceId: price.id,
        currency: (price.currency || "sek").toUpperCase(),
        interval: price.recurring?.interval ?? null,
        amount: price.unit_amount != null ? price.unit_amount / 100 : null,
      };
      if (price.billing_scheme === "tiered" && price.tiers?.length) {
        const [first, second] = price.tiers;
        base.amount =
          first.flat_amount != null ? first.flat_amount / 100 : null;
        base.includedSeats = first.up_to ?? null;
        base.perSeat =
          second?.unit_amount != null ? second.unit_amount / 100 : null;
      }
      return base;
    } catch (error) {
      this.logger.warn(
        `Could not load Stripe price ${id}: ${(error as Error)?.message}`,
      );
      return null;
    }
  }

  // Plans (and add-ons) with live prices pulled from Stripe.
  async getPlans() {
    if (!this.stripe) return { enabled: false, plans: [], addons: [] };
    const intervals: BillingInterval[] = ["monthly", "yearly"];

    const plans: Array<{
      tier: PlanTier;
      perSeat: boolean;
      maxUsers: number | null;
      prices: Record<string, PriceInfo>;
    }> = [];
    for (const tier of PLAN_TIERS) {
      const prices: Record<string, PriceInfo> = {};
      for (const interval of intervals) {
        const id = priceIdFor(tier, interval);
        const info = id ? await this.loadPrice(id) : null;
        if (info) prices[interval] = info;
      }
      if (Object.keys(prices).length) {
        plans.push({
          tier,
          perSeat: isPerSeat(tier),
          maxUsers: maxUsersForPlan(tier),
          prices,
        });
      }
    }

    const addons: Array<{ addon: Addon; prices: Record<string, PriceInfo> }> =
      [];
    for (const addon of ADDONS) {
      const prices: Record<string, PriceInfo> = {};
      for (const interval of intervals) {
        const id = addonPriceIdFor(addon, interval);
        const info = id ? await this.loadPrice(id) : null;
        if (info) prices[interval] = info;
      }
      if (Object.keys(prices).length) addons.push({ addon, prices });
    }

    return { enabled: true, includedSeats: INCLUDED_SEATS, plans, addons };
  }

  // Lightweight status lookup used by the paywall interceptor (mutations only).
  async getSubscriptionStatus(companyId: string): Promise<string | null> {
    if (!companyId) return null;
    const company = await this.companyModel
      .findById(companyId)
      .select("subscriptionStatus")
      .lean()
      .exec();
    return (
      (company as { subscriptionStatus?: string } | null)?.subscriptionStatus ??
      null
    );
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
      billableSeats: await this.countBillableSeats(String(company._id)),
    };
  }

  // Verify a webhook payload against the signing secret.
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException("Webhook secret not configured");
    }
    try {
      return this.client().webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException("Invalid Stripe signature");
    }
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

  // The subscription item that carries the plan (add-ons are separate items).
  private planItem(sub: Stripe.Subscription) {
    for (const item of sub.items?.data ?? []) {
      const tier = item.price?.id ? tierForPriceId(item.price.id) : null;
      if (tier) return { item, tier };
    }
    return null;
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

    const tier = this.planItem(sub)?.tier ?? null;
    const status = sub.status;
    const periodEnd = (sub as unknown as { current_period_end?: number })
      .current_period_end;
    const active = ACTIVE_STATUSES.has(status);

    company.subscriptionStatus = status;
    company.plan = active ? tier : null;
    // A paid plan sets its own seat cap (faktura: 2; per-seat tiers: none).
    if (active && tier) company.maxUsers = maxUsersForPlan(tier);
    company.cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
    company.currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : null;
    company.trialEndsAt = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
    company.stripeSubscriptionId = status === "canceled" ? null : sub.id;

    await company.save();
    this.logger.log(
      `Subscription ${sub.id} for company ${company._id} → ${status} (${tier ?? "no plan"})`,
    );
  }

  // Keep each per-seat subscription's quantity equal to the company's billable
  // seats. No proration: the new count applies from the next invoice, so a
  // company is never charged mid-period for a worker who clocked in once.
  async syncSeats(companyId: string): Promise<void> {
    if (!this.stripe) return;
    const company = await this.getCompany(companyId);
    if (!company.stripeSubscriptionId || !isPerSeat(company.plan)) return;

    const sub = await this.stripe.subscriptions.retrieve(
      company.stripeSubscriptionId,
    );
    if (!ACTIVE_STATUSES.has(sub.status)) return;
    const found = this.planItem(sub);
    if (!found || !isPerSeat(found.tier)) return;

    const seats = quantityFor(
      found.tier,
      await this.countBillableSeats(companyId),
    );
    if (found.item.quantity === seats) return;
    await this.stripe.subscriptionItems.update(found.item.id, {
      quantity: seats,
      proration_behavior: "none",
    });
    this.logger.log(
      `Seats for company ${companyId}: ${found.item.quantity} → ${seats}`,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async syncAllSeats(): Promise<void> {
    if (cronsDisabled() || !this.stripe || this.syncing) return;
    this.syncing = true;
    try {
      const companies = await this.companyModel
        .find({
          stripeSubscriptionId: { $ne: null },
          subscriptionStatus: { $in: [...ACTIVE_STATUSES] },
        })
        .select("_id plan")
        .lean()
        .exec();
      for (const c of companies) {
        if (!isPerSeat(c.plan)) continue;
        try {
          await this.syncSeats(String(c._id));
        } catch (error) {
          this.logger.error(
            `Seat sync failed for company ${String(c._id)}: ${(error as Error)?.message}`,
          );
        }
      }
    } finally {
      this.syncing = false;
    }
  }
}
