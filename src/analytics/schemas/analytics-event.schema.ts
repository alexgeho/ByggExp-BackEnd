import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import { UserRole } from "../../users/schemas/user.schema";

export type AnalyticsEventDocument = AnalyticsEvent & Document;

// A single product-analytics event (onboarding funnel, activation, etc.). The
// client sends the event name + free-form props; the server stamps who/which
// company/when so the data is trustworthy and can be sliced per company.
@Schema({ timestamps: true })
export class AnalyticsEvent {
  @Prop({ required: true, index: true })
  event: string;

  @Prop({ type: Object, default: {} })
  props: Record<string, unknown>;

  // Client-side timestamp (ms) when the event fired — may differ from the
  // server receivedAt (createdAt) if the browser buffered it.
  @Prop({ type: Number, default: null })
  clientTs?: number | null;

  @Prop({ type: String, default: null, index: true })
  userId?: string | null;

  @Prop({ type: String, ref: "Company", default: null, index: true })
  companyId?: string | null;

  @Prop({ type: String, enum: UserRole, default: null })
  role?: UserRole | null;
}

export const AnalyticsEventSchema =
  SchemaFactory.createForClass(AnalyticsEvent);
