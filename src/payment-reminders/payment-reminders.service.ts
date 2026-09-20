import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  SupplierInvoice,
  SupplierInvoiceDocument,
  SupplierInvoiceStatus,
} from "../supplier-invoices/schemas/supplier-invoice.schema";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import { NotificationsService } from "../notifications/notifications.service";
import { cronsDisabled } from "../common/cron.util";

const DAY = 24 * 60 * 60 * 1000;

// Days-before-due milestones we remind at. 7 matches DUE_SOON_DAYS in the admin
// panel's paymentDue helper (and the app's copy of it), so "due soon" means the
// same thing everywhere. -1 = already overdue, reminded once a day.
const BUCKETS = [7, 1, 0];

const startOfDay = (value: Date | string): number => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

@Injectable()
export class PaymentRemindersService {
  private readonly logger = new Logger(PaymentRemindersService.name);
  private running = false;

  constructor(
    @InjectModel(SupplierInvoice.name)
    private invoiceModel: Model<SupplierInvoiceDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Daily sweep: nag about bills that still have to be paid, so none of them
  // slips into debt collection (inkasso) because someone forgot.
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async run(): Promise<void> {
    if (cronsDisabled() || this.running) return;
    this.running = true;
    try {
      await this.scanAndRemind();
    } catch (error) {
      this.logger.error("Payment reminder sweep failed", error);
    } finally {
      this.running = false;
    }
  }

  // The milestone a given "days left" falls into, or null while it is still far
  // out (so a bill due in a month stays quiet).
  private bucketFor(daysLeft: number): number | null {
    if (daysLeft < 0) return -1;
    const hit = BUCKETS.filter((bucket) => daysLeft <= bucket);
    return hit.length ? Math.min(...hit) : null;
  }

  async scanAndRemind(): Promise<void> {
    const today = startOfDay(new Date());

    const invoices = await this.invoiceModel
      .find({
        status: { $ne: SupplierInvoiceStatus.Paid },
        dueDate: { $nin: ["", null] },
      })
      .exec();

    const adminsByCompany = new Map<string, string[]>();
    const getAdmins = async (companyId: string): Promise<string[]> => {
      if (!companyId) return [];
      const cached = adminsByCompany.get(companyId);
      if (cached) return cached;
      const admins = await this.userModel
        .find({ companyId, role: UserRole.CompanyAdmin })
        .select("_id")
        .lean()
        .exec();
      const ids = admins.map((admin) => String(admin._id));
      adminsByCompany.set(companyId, ids);
      return ids;
    };

    for (const invoice of invoices) {
      const due = startOfDay(invoice.dueDate);
      if (Number.isNaN(due)) continue;

      const daysLeft = Math.round((due - today) / DAY);
      const bucket = this.bucketFor(daysLeft);

      if (bucket === null) {
        // Still far out (or the due date moved) — re-arm for later.
        if (invoice.lastReminderBucket != null) {
          invoice.lastReminderBucket = null;
          await invoice.save();
        }
        continue;
      }

      // Overdue bills nag every day, so the -1 bucket is allowed to repeat;
      // the pre-due milestones fire once each.
      if (bucket !== -1 && invoice.lastReminderBucket === bucket) continue;
      if (bucket === -1 && invoice.lastReminderDay === today) continue;

      invoice.lastReminderBucket = bucket;
      invoice.lastReminderDay = today;
      await invoice.save();

      const recipients = await getAdmins(String(invoice.companyId || ""));
      if (!recipients.length) continue;

      const supplier = invoice.supplierName || "Leverantör";
      const when =
        daysLeft < 0
          ? `förföll för ${Math.abs(daysLeft)} dagar sedan`
          : daysLeft === 0
            ? "förfaller idag"
            : `förfaller om ${daysLeft} dagar`;

      try {
        await this.notificationsService.sendToUsers(recipients, {
          title: daysLeft < 0 ? "Obetald faktura" : "Faktura att betala",
          body: `${supplier} — ${when}.`,
          data: {
            type: "supplier_invoice_due",
            screen: "Economy",
            entityId: String(invoice._id),
          },
        });
      } catch (error) {
        this.logger.error("Failed to send payment reminder", error);
      }
    }
  }
}
