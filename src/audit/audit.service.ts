import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { AuditLog, AuditLogDocument } from "./schemas/audit-log.schema";

export interface AuditEntry {
  companyId?: string | null;
  userId?: string | null;
  userEmail?: string;
  userRole?: string;
  method: string;
  path: string;
  entityType?: string | null;
  entityId?: string | null;
  statusCode: number;
  success: boolean;
  event?: string;
  message?: string;
  client?: string;
}

// A step of the sign-up / sign-in story (see AuditLog.event). These happen
// without a signed-in user, so the interceptor cannot write them.
export interface AuditEvent {
  event: string;
  companyId?: string | null;
  userId?: string | null;
  userEmail?: string;
  userRole?: string;
  success?: boolean;
  message?: string;
}

// Web admin or mobile app, from what the client says about itself.
export function clientOf(headers: Record<string, unknown> = {}): string {
  const origin = String(headers.origin || headers.referer || "");
  if (origin.includes("admin.")) return "admin";
  const agent = String(headers["user-agent"] || "").toLowerCase();
  if (/okhttp|cfnetwork|expo|byggexp|darwin/.test(agent)) return "app";
  return origin ? "admin" : "";
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly model: Model<AuditLogDocument>,
  ) {}

  // Fire-and-forget: an audit write must never break or slow the real request.
  record(entry: AuditEntry): void {
    this.model.create(entry).catch((error) => {
      this.logger.warn(`Failed to write audit log: ${error?.message || error}`);
    });
  }

  // Fire-and-forget, like `record`.
  event(entry: AuditEvent): void {
    this.record({
      method: "",
      path: "",
      statusCode: entry.success === false ? 400 : 200,
      success: entry.success !== false,
      companyId: entry.companyId ?? null,
      userId: entry.userId ?? null,
      userEmail: (entry.userEmail || "").toLowerCase(),
      userRole: entry.userRole || "",
      event: entry.event,
      message: (entry.message || "").slice(0, 300),
    });
  }

  // `companyId` null = every company (superadmin only — the controller decides).
  async query(
    companyId: string | null,
    filters: {
      entityType?: string;
      userId?: string;
      email?: string;
      failed?: boolean;
      page?: number;
      pageSize?: number;
    },
  ) {
    const query: Record<string, unknown> = {};
    if (companyId) query.companyId = companyId;
    if (filters.entityType) query.entityType = filters.entityType;
    if (filters.userId) query.userId = filters.userId;
    if (filters.email) query.userEmail = filters.email.trim().toLowerCase();
    if (filters.failed) query.success = false;

    const pageSize = Math.min(Math.max(Number(filters.pageSize) || 50, 1), 200);
    const page = Math.max(Number(filters.page) || 1, 1);

    const [items, total] = await Promise.all([
      this.model
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      this.model.countDocuments(query).exec(),
    ]);

    return { items, total, page, pageSize };
  }
}
