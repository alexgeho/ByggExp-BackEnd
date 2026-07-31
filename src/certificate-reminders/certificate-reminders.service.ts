import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import { NotificationsService } from "../notifications/notifications.service";
import { cronsDisabled } from "../common/cron.util";

const DAY = 24 * 60 * 60 * 1000;
// Days-before-expiry milestones we remind at (plus -1 = already expired).
const BUCKETS = [30, 14, 7, 1, 0];

const startOfDay = (value: Date | string): number => {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

type CertificateLike = {
  name?: string;
  expiresAt?: Date | null;
  lastReminderBucket?: number | null;
};

@Injectable()
export class CertificateRemindersService {
  private readonly logger = new Logger(CertificateRemindersService.name);
  private running = false;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Daily sweep. Fires once when a certificate crosses each milestone.
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async run(): Promise<void> {
    if (cronsDisabled() || this.running) return;
    this.running = true;
    try {
      await this.scanAndRemind();
    } catch (error) {
      this.logger.error("Certificate reminder sweep failed", error);
    } finally {
      this.running = false;
    }
  }

  private bucketFor(daysLeft: number): number | null {
    if (daysLeft < 0) return -1; // expired
    const hit = BUCKETS.filter((b) => daysLeft <= b);
    return hit.length ? Math.min(...hit) : null; // null → still far out
  }

  async scanAndRemind(): Promise<void> {
    const today = startOfDay(new Date());
    const users = await this.userModel
      .find({ "certificates.0": { $exists: true } })
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
      const ids = admins.map((a) => String(a._id));
      adminsByCompany.set(companyId, ids);
      return ids;
    };

    for (const user of users) {
      const certs = user.certificates as unknown as CertificateLike[];
      const due: Array<{ cert: CertificateLike; daysLeft: number }> = [];
      let changed = false;

      for (const cert of certs) {
        if (!cert.expiresAt) continue;
        const daysLeft = Math.ceil((startOfDay(cert.expiresAt) - today) / DAY);
        const bucket = this.bucketFor(daysLeft);

        if (bucket === null) {
          // Far out (or renewed) — re-arm for the future.
          if (cert.lastReminderBucket != null) {
            cert.lastReminderBucket = null;
            changed = true;
          }
          continue;
        }
        if (cert.lastReminderBucket === bucket) continue; // already reminded
        cert.lastReminderBucket = bucket;
        changed = true;
        due.push({ cert, daysLeft });
      }

      if (changed) await user.save();
      if (!due.length) continue;

      const admins = await getAdmins(String(user.companyId || ""));
      const recipients = [...new Set([...admins, String(user._id)])];
      if (!recipients.length) continue;

      const holder = user.name || user.email || "Anställd";
      for (const { cert, daysLeft } of due) {
        const when =
          daysLeft < 0
            ? `gick ut för ${Math.abs(daysLeft)} dagar sedan`
            : daysLeft === 0
              ? "går ut idag"
              : `går ut om ${daysLeft} dagar`;
        try {
          await this.notificationsService.sendToUsers(recipients, {
            title: daysLeft < 0 ? "Certifikat utgånget" : "Certifikat går snart ut",
            body: `${cert.name || "Certifikat"} — ${holder} ${when}.`,
            data: {
              type: "certificate_expiry",
              screen: "User",
              entityId: String(user._id),
            },
          });
        } catch (error) {
          this.logger.error("Failed to send certificate reminder", error);
        }
      }
    }
  }
}
