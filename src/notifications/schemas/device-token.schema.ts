import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DeviceTokenDocument = DeviceToken & Document;

export enum DevicePlatform {
  IOS = 'ios',
  Android = 'android',
  Web = 'web',
  Unknown = 'unknown',
}

@Schema({ timestamps: true, collection: 'device_tokens' })
export class DeviceToken {
  @Prop({ required: true, ref: 'User', index: true })
  userId: string;

  @Prop({ required: true, unique: true })
  installationId: string;

  @Prop({ required: true, index: true })
  expoPushToken: string;

  @Prop({ required: true, enum: DevicePlatform, default: DevicePlatform.Unknown })
  platform: DevicePlatform;

  @Prop()
  appVersion?: string;

  @Prop({ default: true, index: true })
  enabled: boolean;

  @Prop({ type: Date, default: Date.now })
  lastSeenAt: Date;
}

export const DeviceTokenSchema = SchemaFactory.createForClass(DeviceToken);
