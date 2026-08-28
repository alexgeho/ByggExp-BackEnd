import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

// One row per shift transition, so a manager can see the full timeline of a
// worker's day: when they checked in, left the project area (auto-pause),
// returned (auto-resume), paused/resumed by hand, and checked out. The Shift
// document only keeps aggregate state (segments + current status), which loses
// *why* each pause happened once the next transition overwrites it — this log
// is the durable, queryable record. Mirrors the ToolEvent pattern.
export enum ShiftEventType {
  CheckedIn = "checked_in", // shift started (manual or geofence auto check-in)
  Paused = "paused", // paused by hand
  Resumed = "resumed", // resumed by hand
  AutoPausedGeofenceExit = "auto_paused_geofence_exit", // left the project area
  AutoResumedGeofenceReturn = "auto_resumed_geofence_return", // returned to area
  AutoPausedOffline = "auto_paused_offline", // device went silent
  Completed = "completed", // checked out / shift closed
  ManualHoursSet = "manual_hours_set", // manual hours entered for the day
}

export enum ShiftEventSource {
  Manual = "manual", // the worker acted in the app
  Gps = "gps", // a geofence transition
  Auto = "auto", // an in-app automatic transition
  System = "system", // a server-side finalizer (schedule/day rollover)
}

export type ShiftEventDocument = HydratedDocument<ShiftEvent>;

@Schema({ timestamps: true })
export class ShiftEvent {
  @Prop({ type: String, ref: "Shift", required: true, index: true })
  shiftId: string;

  @Prop({ type: String, ref: "Project", required: true, index: true })
  projectId: string;

  @Prop({ type: String, ref: "User", required: true, index: true })
  workerId: string;

  // Stored explicitly (the Shift has no companyId) so admin timeline queries can
  // scope by tenant cheaply. Resolved from the project at write time.
  @Prop({ type: String, ref: "Company", default: null, index: true })
  companyId?: string | null;

  @Prop({ enum: ShiftEventType, required: true })
  type: ShiftEventType;

  @Prop({ enum: ShiftEventSource, default: ShiftEventSource.Manual })
  source: ShiftEventSource;

  // completionReason / autoPausedReason as reported by the transition, kept for
  // display and so a past "left area" pause is never lost.
  @Prop({ default: "" })
  reason: string;

  // Who triggered it — the worker themselves, or an admin acting for them.
  @Prop({ type: String, ref: "User", default: null })
  byUserId?: string | null;

  // When the transition actually happened; may differ slightly from createdAt.
  @Prop({ type: Date, default: null })
  occurredAt?: Date | null;
}

export const ShiftEventSchema = SchemaFactory.createForClass(ShiftEvent);

// Whole-shift timeline (chronological) and company-wide recent activity.
ShiftEventSchema.index({ shiftId: 1, createdAt: 1 });
ShiftEventSchema.index({ companyId: 1, createdAt: -1 });
