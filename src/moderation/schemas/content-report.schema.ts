import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type ContentReportDocument = ContentReport & Document;

export enum ContentReportReason {
  Spam = "spam",
  Harassment = "harassment",
  Inappropriate = "inappropriate",
  Other = "other",
}

export enum ContentReportStatus {
  Open = "open",
  Resolved = "resolved",
}

// A user's report about another user or a specific chat message. Surfaced to
// company admins so an offending user/message can be actioned within 24h
// (App Store Review Guideline 1.2).
@Schema({ timestamps: true })
export class ContentReport {
  @Prop({ required: true, ref: "User", index: true })
  reporterId: string;

  @Prop({ required: true, ref: "User", index: true })
  reportedUserId: string;

  @Prop({ type: String, ref: "Chat", default: null })
  chatId: string | null;

  @Prop({ type: String, ref: "Message", default: null })
  messageId: string | null;

  // Snapshot of the reported message text so it survives even if the message
  // is later deleted.
  @Prop({ default: "" })
  messageText: string;

  @Prop({
    required: true,
    enum: ContentReportReason,
    default: ContentReportReason.Other,
  })
  reason: ContentReportReason;

  @Prop({ default: "" })
  note: string;

  @Prop({
    required: true,
    enum: ContentReportStatus,
    default: ContentReportStatus.Open,
    index: true,
  })
  status: ContentReportStatus;

  @Prop({ type: String, ref: "Company", default: null, index: true })
  companyId: string | null;
}

export const ContentReportSchema = SchemaFactory.createForClass(ContentReport);
