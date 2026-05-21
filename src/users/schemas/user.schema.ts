import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole {
  SuperAdmin = 'superadmin',
  CompanyAdmin = 'companyAdmin',
  ProjectAdmin = 'projectAdmin',
  Worker = 'worker',
}

export enum UserWorkStatus {
  OffDuty = 'off_duty',
  Working = 'working',
  OutsideProjectArea = 'outside_project_area',
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ required: true })
  phoneAreaCode: number;

  @Prop({ required: true })
  phoneNumber: number;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  profession: string;

  @Prop({ default: '' })
  avatarUrl: string;

  @Prop({ type: Object, default: { ru: 'Русский' } })
  language: Record<string, any>;

  @Prop({ type: [String], default: [] })
  additionalDocuments: string[];

  @Prop({ required: true, enum: UserRole, default: UserRole.Worker })
  role: UserRole;

  @Prop({ type: String, ref: 'Company', default: null })
  companyId: string | null;

  @Prop({ type: [String], ref: 'Project', default: [] })
  projectIds: string[];

  @Prop({ required: true, enum: UserWorkStatus, default: UserWorkStatus.OffDuty, index: true })
  workStatus: UserWorkStatus;

  @Prop({ type: String, ref: 'Project', default: null })
  workStatusProjectId?: string | null;

  @Prop({ default: '' })
  workStatusProjectName?: string;

  @Prop({ type: String, ref: 'Shift', default: null })
  workStatusShiftId?: string | null;

  @Prop({ default: '' })
  workStatusReason?: string;

  @Prop({ type: Date, default: null })
  workStatusUpdatedAt?: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);