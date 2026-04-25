import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ShiftDocument = Shift & Document;

export enum ShiftStatus {
  Active = 'active',
  Paused = 'paused',
  Completed = 'completed',
}

export class ShiftSegment {
  startedAt: Date;
  endedAt?: Date;
  durationMs: number;
}

export class ShiftPhotoFile {
  name: string;
  url: string;
  mimeType?: string;
  size?: number;
  uploadedAt?: Date;
}

@Schema({ timestamps: true })
export class Shift {
  @Prop({ required: true, ref: 'User', index: true })
  workerId: string;

  @Prop({ required: true, ref: 'Project', index: true })
  projectId: string;

  @Prop({ required: true })
  projectNameSnapshot: string;

  @Prop({ default: '' })
  locationSnapshot: string;

  @Prop({ required: true, index: true })
  shiftDate: string;

  @Prop({ type: Date, required: true })
  startedAt: Date;

  @Prop({ type: Date })
  endedAt?: Date;

  @Prop({ type: Date, default: null })
  lastResumedAt?: Date | null;

  @Prop({ required: true, enum: ShiftStatus, default: ShiftStatus.Active, index: true })
  status: ShiftStatus;

  @Prop({
    type: [
      {
        _id: false,
        startedAt: { type: Date, required: true },
        endedAt: { type: Date },
        durationMs: { type: Number, default: 0 },
      },
    ],
    default: [],
  })
  segments: ShiftSegment[];

  @Prop({ type: Number, default: 0 })
  durationMs: number;

  @Prop({
    type: [
      {
        _id: false,
        name: { type: String, required: true },
        url: { type: String, required: true },
        mimeType: { type: String },
        size: { type: Number },
        uploadedAt: { type: Date },
      },
    ],
    default: [],
  })
  photos: ShiftPhotoFile[];
}

export const ShiftSchema = SchemaFactory.createForClass(Shift);

ShiftSchema.index({ workerId: 1, shiftDate: 1, status: 1 });
