import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type ShiftDocument = Shift & Document;

export enum ShiftStatus {
  Active = "active",
  Paused = "paused",
  Completed = "completed",
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
  @Prop({ required: true, ref: "User", index: true })
  workerId: string;

  @Prop({ required: true, ref: "Project", index: true })
  projectId: string;

  @Prop({ required: true })
  projectNameSnapshot: string;

  @Prop({ default: "" })
  locationSnapshot: string;

  @Prop({ required: true, index: true })
  shiftDate: string;

  @Prop({ type: Date, required: true })
  startedAt: Date;

  @Prop({ type: Date })
  endedAt?: Date;

  @Prop({ type: Date, default: null })
  lastResumedAt?: Date | null;

  @Prop({
    required: true,
    enum: ShiftStatus,
    default: ShiftStatus.Active,
    index: true,
  })
  status: ShiftStatus;

  // Why a shift was paused automatically ('offline' | 'outside_project_area').
  // Empty when the shift is active or the worker paused it manually. Used to
  // auto-resume the shift once the device is seen again, without resuming a
  // deliberate manual pause.
  @Prop({ default: "" })
  autoPausedReason?: string;

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

  // GPS/measured duration — banked from the tracked segments.
  @Prop({ type: Number, default: 0 })
  durationMs: number;

  // Worker-entered hours on a completed shift (the "Manual" hours source),
  // in milliseconds. null = the worker has not entered anything, so Manual
  // stays unlit for this shift; 0 is a deliberate "no hours" entry.
  @Prop({ type: Number, default: null })
  manualDurationMs?: number | null;

  @Prop({ default: "" })
  completionReason?: string;

  @Prop({ default: "" })
  completionSource?: string;

  @Prop({ type: Date, default: null })
  completionNotifiedAt?: Date | null;

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

// Prevents two Active shift documents for the same worker when start() is
// called twice concurrently (double-tap, network retry) — the application-level
// findOne-then-create check in ShiftsService.start() is not race-safe on its own.
ShiftSchema.index(
  { workerId: 1 },
  { unique: true, partialFilterExpression: { status: ShiftStatus.Active } },
);
