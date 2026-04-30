import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TaskReminderDocument = TaskReminder & Document;

export enum TaskReminderScheduleType {
  Once = 'once',
  Daily = 'daily',
  Weekly = 'weekly',
  Custom = 'custom',
}

export enum TaskReminderStatus {
  Active = 'active',
  Paused = 'paused',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

@Schema({ timestamps: true, collection: 'task_reminders' })
export class TaskReminder {
  @Prop({ required: true, ref: 'Task', index: true })
  taskId: string;

  @Prop({ required: true, ref: 'User', index: true })
  targetUserId: string;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({
    required: true,
    enum: TaskReminderScheduleType,
    default: TaskReminderScheduleType.Once,
  })
  scheduleType: TaskReminderScheduleType;

  @Prop()
  timeOfDay?: string;

  @Prop()
  timezone?: string;

  @Prop({ type: [Number], default: [] })
  daysOfWeek: number[];

  @Prop({ type: Date })
  startAt?: Date;

  @Prop({ type: Date })
  endAt?: Date;

  @Prop({ type: Date, index: true })
  nextRunAt?: Date;

  @Prop({ type: Date })
  lastSentAt?: Date;

  @Prop({
    required: true,
    enum: TaskReminderStatus,
    default: TaskReminderStatus.Active,
  })
  status: TaskReminderStatus;
}

export const TaskReminderSchema = SchemaFactory.createForClass(TaskReminder);
