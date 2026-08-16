import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  UserBlock,
  UserBlockDocument,
} from "./schemas/user-block.schema";
import {
  ContentReport,
  ContentReportDocument,
  ContentReportStatus,
} from "./schemas/content-report.schema";
import { CreateReportDto } from "./dto/create-report.dto";
import { Message, MessageDocument } from "../messages/schemas/message.schema";

type AuthUser = {
  userId?: string;
  companyId?: string | null;
  role?: string;
};

@Injectable()
export class ModerationService {
  constructor(
    @InjectModel(UserBlock.name)
    private blockModel: Model<UserBlockDocument>,
    @InjectModel(ContentReport.name)
    private reportModel: Model<ContentReportDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
  ) {}

  async block(blockerId: string, blockedId: string, companyId?: string | null) {
    if (!blockedId || blockerId === blockedId) {
      throw new BadRequestException("Cannot block this user");
    }
    // Idempotent: upsert so blocking twice is a no-op, not a duplicate-key error.
    await this.blockModel.updateOne(
      { blockerId, blockedId },
      { $setOnInsert: { blockerId, blockedId, companyId: companyId ?? null } },
      { upsert: true },
    );
    return { ok: true, blockedId };
  }

  async unblock(blockerId: string, blockedId: string) {
    await this.blockModel.deleteOne({ blockerId, blockedId });
    return { ok: true, blockedId };
  }

  // Ids this user has blocked — the app hides these people/their messages.
  async listBlocked(blockerId: string): Promise<string[]> {
    const rows = await this.blockModel
      .find({ blockerId })
      .select("blockedId")
      .lean()
      .exec();
    return rows.map((r) => String(r.blockedId));
  }

  // True if EITHER user has blocked the other — used to stop delivery both ways.
  async isBlockedBetween(a: string, b: string): Promise<boolean> {
    const row = await this.blockModel
      .findOne({
        $or: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      })
      .select("_id")
      .lean()
      .exec();
    return !!row;
  }

  async createReport(reporter: AuthUser, dto: CreateReportDto) {
    if (!reporter?.userId) {
      throw new NotFoundException("No authenticated user");
    }
    // Snapshot the reported message text so the report is still meaningful even
    // if the message is later deleted.
    let messageText = "";
    if (dto.messageId) {
      const message = await this.messageModel
        .findById(dto.messageId)
        .select("text")
        .lean()
        .exec();
      messageText = String(message?.text ?? "");
    }
    const report = await this.reportModel.create({
      reporterId: reporter.userId,
      reportedUserId: dto.reportedUserId,
      chatId: dto.chatId ?? null,
      messageId: dto.messageId ?? null,
      messageText,
      reason: dto.reason,
      note: dto.note ?? "",
      status: ContentReportStatus.Open,
      companyId: reporter.companyId ?? null,
    });
    return report;
  }

  // Admin view: reports raised inside the admin's own company.
  async listReports(actor: AuthUser) {
    const filter = actor?.companyId ? { companyId: actor.companyId } : {};
    return this.reportModel.find(filter).sort({ createdAt: -1 }).lean().exec();
  }

  async resolveReport(id: string, actor: AuthUser) {
    const report = await this.reportModel.findById(id).exec();
    if (!report) {
      throw new NotFoundException(`Report "${id}" not found`);
    }
    if (
      actor?.companyId &&
      String(report.companyId ?? "") !== String(actor.companyId)
    ) {
      throw new NotFoundException(`Report "${id}" not found`);
    }
    report.status = ContentReportStatus.Resolved;
    await report.save();
    return report;
  }
}
