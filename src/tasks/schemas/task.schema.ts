import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TaskDocument = Task & Document;

@Schema()
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

  @Prop({ type: [String] }) // Документы задачи
  documents: string[];

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true })
  dueDate: Date;
}

export const TaskSchema = SchemaFactory.createForClass(Task);