import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserActivityLogDocument = UserActivityLog & Document;

export enum UserActivityLogLevel {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
}

@Schema({ timestamps: true, collection: 'user_activity_logs' })
export class UserActivityLog {
  @Prop({ required: true, ref: 'User', index: true })
  userId: string;

  @Prop({ required: true, index: true })
  category: string;

  @Prop({ required: true, index: true })
  type: string;

  @Prop({ required: true, enum: UserActivityLogLevel, default: UserActivityLogLevel.Info, index: true })
  level: UserActivityLogLevel;

  @Prop({ required: true })
  message: string;

  @Prop()
  source?: string;

  @Prop({ type: Object, default: {} })
  details: Record<string, any>;
}

export const UserActivityLogSchema = SchemaFactory.createForClass(UserActivityLog);
