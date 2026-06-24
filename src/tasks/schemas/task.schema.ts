import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type TaskDocument = Task & Document;

export class TaskDocumentFile {
  name: string;
  url: string;
  mimeType?: string;
}

@Schema({ timestamps: true })
export class Task {
  @Prop({ ref: 'Project', default: null, index: true }) // Ссылка на проект
  projectId?: string | null;

  @Prop({ ref: 'User', default: null, index: true }) // Персональная задача
  assigneeUserId?: string | null;

  @Prop({ default: '' })
  assigneeUserName?: string;

  @Prop({ ref: 'User', default: null, index: true })
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
}

export const TaskSchema = SchemaFactory.createForClass(Task);