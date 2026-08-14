import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type HoursReminderStateDocument = HoursReminderState & Document;

export enum HoursReminderStatus {
  Active = "active",
  Done = "done", // worker reported hours
  Stopped = "stopped", // hit maxReminders / rule disabled / stale
}

// Per worker × project × day tracking for the shift-anchored hours reminder.
// The cron seeds one of these after the scheduled shift end and advances it
// (nextRunAt) on every push until the worker reports hours or it stops.
@Schema({ timestamps: true })
export class HoursReminderState {
  @Prop({ ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ ref: "Project", required: true, index: true })
  projectId: string;

  @Prop({ ref: "User", required: true, index: true })
  workerId: string;

  // Day key YYYY-MM-DD, matching Shift.shiftDate.
  @Prop({ required: true })
  date: string;

  @Prop({ type: Number, default: 0 })
  remindersSent: number;

  @Prop({ type: Date, default: null })
  lastSentAt?: Date | null;

  // When the cron should next act on this state.
  @Prop({ type: Date, index: true })
  nextRunAt?: Date;

  // When the boss escalation was sent (once).
  @Prop({ type: Date, default: null })
  escalatedAt?: Date | null;

  @Prop({
    type: String,
    enum: HoursReminderStatus,
    default: HoursReminderStatus.Active,
    index: true,
  })
  status: HoursReminderStatus;
}

export const HoursReminderStateSchema =
  SchemaFactory.createForClass(HoursReminderState);

// One state per worker-day-project.
HoursReminderStateSchema.index(
  { workerId: 1, projectId: 1, date: 1 },
  { unique: true },
);
