import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Model } from "mongoose";
import { cronsDisabled } from "../common/cron.util";
import { NotificationsService } from "../notifications/notifications.service";
import {
  resolveNotificationLang,
  NotificationLang,
} from "../task-reminders/task-reminder-settings";
import {
  User,
  UserDocument,
  UserRole,
  ManagerReminderSettings,
} from "../users/schemas/user.schema";
import { Project, ProjectDocument } from "../projects/schemas/project.schema";
import { Task, TaskDocument } from "../tasks/schemas/task.schema";
import { Invoice, InvoiceDocument } from "../invoices/schemas/invoice.schema";
import {
  SupplierInvoice,
  SupplierInvoiceDocument,
} from "../supplier-invoices/schemas/supplier-invoice.schema";
import { Expense, ExpenseDocument } from "../expenses/schemas/expense.schema";

const TZ = "Europe/Stockholm";
const QUIET_START = 7; // reminders only 07:00–20:00 for the "every N hours" mode
const QUIET_END = 20;

type SummaryCounts = {
  overdueTasks: number;
  unpaidInvoices: number;
  purchaseInvoicesDue: number;
  expensesToApprove: number;
};

@Injectable()
export class ManagerRemindersService {
  private readonly logger = new Logger(ManagerRemindersService.name);
  private isRunning = false;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(SupplierInvoice.name)
    private supplierInvoiceModel: Model<SupplierInvoiceDocument>,
    @InjectModel(Expense.name) private expenseModel: Model<ExpenseDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Local (Stockholm) hour, YYYY-MM-DD day key and ISO weekday (1=Mon…7=Sun).
  private localParts(now: Date) {
    const hour = Number(
      now.toLocaleString("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }),
    );
    const dayKey = now.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
    const dow = new Date(`${dayKey}T00:00:00Z`).getUTCDay(); // 0=Sun
    const weekday = ((dow + 6) % 7) + 1; // 1=Mon…7=Sun
    return { hour, dayKey, weekday };
  }

  private isDue(s: ManagerReminderSettings, now: Date): boolean {
    const { hour, dayKey, weekday } = this.localParts(now);
    const last = s.lastSentAt ? new Date(s.lastSentAt) : null;

    if (s.mode === "hours") {
      if (hour < QUIET_START || hour >= QUIET_END) return false;
      if (!last) return true;
      return now.getTime() - last.getTime() >= s.intervalHours * 3600_000 - 60_000;
    }
    if (s.mode === "daily") {
      if (hour !== Number(s.timeOfDay.slice(0, 2))) return false;
      const lastDay = last ? last.toLocaleDateString("en-CA", { timeZone: TZ }) : null;
      return lastDay !== dayKey;
    }
    if (s.mode === "weekly") {
      if (weekday !== s.weekday) return false;
      if (hour !== Number(s.timeOfDay.slice(0, 2))) return false;
      if (!last) return true;
      return now.getTime() - last.getTime() >= 6 * 24 * 3600_000;
    }
    return false;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async processManagerReminders(): Promise<void> {
    if (cronsDisabled() || this.isRunning) return;
    this.isRunning = true;
    try {
      const now = new Date();
      const managers = await this.userModel
        .find({
          role: UserRole.CompanyAdmin,
          companyId: { $nin: [null, ""] },
          "reminderSummary.mode": { $ne: "off" },
        })
        .exec();

      for (const manager of managers) {
        const settings = manager.reminderSummary;
        if (!settings || !this.isDue(settings, now)) continue;

        const counts = await this.buildCounts(manager);
        const total = this.totalOf(counts, settings);
        if (total > 0) {
          await this.send(manager, counts, settings);
        }
        // Stamp regardless so the cadence advances even on an all-clear tick.
        await this.userModel.updateOne(
          { _id: manager._id },
          { $set: { "reminderSummary.lastSentAt": now } },
        );
      }
    } catch (error) {
      this.logger.error("Failed to process manager reminders", error);
    } finally {
      this.isRunning = false;
    }
  }

  // Manual "Send a test reminder" — bypasses schedule/quiet hours and always
  // sends (an all-clear message when there is nothing outstanding).
  async sendTest(userId: string): Promise<{ sent: boolean }> {
    const manager = await this.userModel.findById(userId).exec();
    if (!manager) return { sent: false };
    const counts = await this.buildCounts(manager);
    const settings = manager.reminderSummary;
    const total = this.totalOf(counts, settings);
    if (total > 0) {
      await this.send(manager, counts, settings);
    } else {
      const lang = resolveNotificationLang(manager.language);
      await this.notificationsService.sendToUsers([userId], {
        title: lang === "sv" ? "Allt är klart" : "All clear",
        body:
          lang === "sv"
            ? "Inget kräver din uppmärksamhet just nu."
            : "Nothing needs your attention right now.",
        data: { type: "manager_summary", screen: "Dashboard" },
      });
    }
    return { sent: true };
  }

  private async buildCounts(manager: UserDocument): Promise<SummaryCounts> {
    const companyId = String(manager.companyId);
    const s = manager.reminderSummary;
    const now = new Date();

    let overdueTasks = 0;
    if (s.overdueTasks) {
      const projects = await this.projectModel
        .find({ companyId })
        .select("_id")
        .lean()
        .exec();
      const projectIds = projects.map((p) => String(p._id));
      if (projectIds.length) {
        overdueTasks = await this.taskModel.countDocuments({
          projectId: { $in: projectIds },
          status: "open",
          dueDate: { $ne: null, $lt: now },
        });
      }
    }

    const unpaidInvoices = s.unpaidInvoices
      ? await this.invoiceModel.countDocuments({
          companyId,
          status: { $in: ["sent", "overdue"] },
        })
      : 0;

    let purchaseInvoicesDue = 0;
    if (s.purchaseInvoicesDue) {
      const soon = new Date(now.getTime() + 7 * 24 * 3600_000)
        .toISOString()
        .slice(0, 10);
      purchaseInvoicesDue = await this.supplierInvoiceModel.countDocuments({
        companyId,
        status: { $ne: "paid" },
        dueDate: { $nin: [null, ""], $lte: soon },
      });
    }

    const expensesToApprove = s.expensesToApprove
      ? await this.expenseModel.countDocuments({ companyId, status: "submitted" })
      : 0;

    return { overdueTasks, unpaidInvoices, purchaseInvoicesDue, expensesToApprove };
  }

  private totalOf(c: SummaryCounts, s?: ManagerReminderSettings): number {
    if (!s) return 0;
    return (
      (s.overdueTasks ? c.overdueTasks : 0) +
      (s.unpaidInvoices ? c.unpaidInvoices : 0) +
      (s.purchaseInvoicesDue ? c.purchaseInvoicesDue : 0) +
      (s.expensesToApprove ? c.expensesToApprove : 0)
    );
  }

  private async send(
    manager: UserDocument,
    c: SummaryCounts,
    s: ManagerReminderSettings,
  ) {
    const lang = resolveNotificationLang(manager.language);
    const parts: string[] = [];
    const add = (on: boolean, n: number, en: string, sv: string) => {
      if (on && n > 0) parts.push(lang === "sv" ? `${n} ${sv}` : `${n} ${en}`);
    };
    add(s.overdueTasks, c.overdueTasks, "overdue tasks", "försenade uppgifter");
    add(s.unpaidInvoices, c.unpaidInvoices, "unpaid invoices", "obetalda fakturor");
    add(
      s.purchaseInvoicesDue,
      c.purchaseInvoicesDue,
      "purchase invoices due",
      "inköpsfakturor att betala",
    );
    add(
      s.expensesToApprove,
      c.expensesToApprove,
      "expenses to approve",
      "utlägg att godkänna",
    );

    const total = this.totalOf(c, s);
    const title =
      lang === "sv"
        ? `Kräver din uppmärksamhet — ${total}`
        : `Needs your attention — ${total}`;
    const body = parts.join(" · ");

    await this.notificationsService.sendToUsers([String(manager._id)], {
      title,
      body,
      data: { type: "manager_summary", screen: "Dashboard" },
    });
  }
}
