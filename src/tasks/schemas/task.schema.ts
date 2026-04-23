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
  @Prop({ required: true, ref: 'Project' }) // Ссылка на проект
  projectId: string;

  @Prop({ required: true })
  taskTitle: string;

  @Prop()
  taskDescription: string;

  @Prop()
  notes: string;

  @Prop({ type: [String] }) // Уведомления
  notifications: string[];

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] }) // Документы задачи
  documents: Array<string | TaskDocumentFile>;

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true })
  dueDate: Date;
}

export const TaskSchema = SchemaFactory.createForClass(Task);