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

  async query(
    companyId: string,
    filters: { entityType?: string; userId?: string; page?: number; pageSize?: number },
  ) {
    const query: Record<string, unknown> = { companyId };
    if (filters.entityType) query.entityType = filters.entityType;
    if (filters.userId) query.userId = filters.userId;

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
