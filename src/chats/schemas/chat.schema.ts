import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChatDocument = Chat & Document;

export enum ChatType {
  Direct = 'direct',
  Group = 'group',
}

@Schema({ timestamps: true })
export class Chat {
  @Prop({ required: true, ref: 'User' }) // Владелец чата
  ownerId: string;

  @Prop({ required: true, enum: ChatType })
  type: ChatType;

  @Prop({ type: [String], ref: 'User', default: [] }) // Участники чата
  members: string[];

  @Prop({ type: String, default: '' })
  title: string;

  @Prop({ type: String, ref: 'Project', default: null })
  projectId?: string | null;

  @Prop({ type: String })
  directKey?: string | null;

  @Prop({ type: String })
  groupKey?: string | null;

  @Prop({ type: String, default: '' })
  lastMessageText?: string;

  @Prop({ type: Date, default: null })
  lastMessageAt?: Date | null;
}

export const ChatSchema = SchemaFactory.createForClass(Chat);

ChatSchema.index({ members: 1, lastMessageAt: -1 });
ChatSchema.index({ projectId: 1 });
ChatSchema.index({ directKey: 1 }, { unique: true, sparse: true });
ChatSchema.index({ groupKey: 1 }, { unique: true, sparse: true });