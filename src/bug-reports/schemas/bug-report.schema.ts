import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { UserRole } from '../../users/schemas/user.schema';

export type BugReportDocument = BugReport & Document;

export enum BugReportStatus {
  Open = 'open',
  InProgress = 'in_progress',
  Resolved = 'resolved',
}

export type BugReportAttachment = {
  name: string;
  url: string;
  mimeType?: string;
  size?: number;
};

@Schema({ timestamps: true })
export class BugReport {
  @Prop({ default: '' })
  message: string;

  @Prop({
    required: true,
    enum: BugReportStatus,
    default: BugReportStatus.Open,
    index: true,
  })
  status: BugReportStatus;

  @Prop({ required: true })
  createdByUserId: string;

  @Prop({ default: '' })
  reporterEmail: string;

  @Prop({ enum: UserRole })
  reporterRole: UserRole;

  @Prop({ type: String, ref: 'Company', default: null, index: true })
  companyId?: string | null;

  @Prop({ type: Object, default: null })
  attachment?: BugReportAttachment | null;
}

export const BugReportSchema = SchemaFactory.createForClass(BugReport);
