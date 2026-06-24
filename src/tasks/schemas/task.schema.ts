import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type TaskDocument = Task & Document;

export enum TaskStatus {
  Open = 'open',
  Completed = 'completed',
}

export class TaskDocumentFile {
  name: string;
  url: string;
  mimeType?: string;
}

@Schema({ timestamps: true })
export class Task {
  @Prop({ type: String, ref: 'Project', default: null, index: true }) // Ссылка на проект
  projectId?: string | null;

  @Prop({ type: String, ref: 'User', default: null, index: true }) // Персональная задача
  assigneeUserId?: string | null;

  @Prop({ default: '' })
  assigneeUserName?: string;

  @Prop({ type: String, ref: 'User', default: null, index: true })
  createdByUserId?: string | null;

  @Prop({ required: true })
  taskTitle: string;

  @Prop()
  taskDescription: string;

  @Prop()
  notes: string;

  @Prop({ type: [String] }) // Уведомления
  notifications: string[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  notificationSettings: Record<string, unknown>;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] }) // Документы задачи
  documents: Array<string | TaskDocumentFile>;

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true })
  dueDate: Date;

  @Prop({ required: true, enum: TaskStatus, default: TaskStatus.Open, index: true })
  status: TaskStatus;

  @Prop({ type: Date, default: null })
  completedAt?: Date | null;

  @Prop({ type: String, ref: 'User', default: null })
  completedByUserId?: string | null;
}

export const TaskSchema = SchemaFactory.createForClass(Task);