import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

// An entry in a tool's history log: hand-offs, returns, inspections, repairs.
export enum ToolEventType {
  Created = "created",
  Handoff = "handoff", // given to a person / moved to a project
  Returned = "returned", // handed back to storage
  Inspection = "inspection",
  Repair = "repair",
  StatusChange = "status_change",
  Note = "note",
}

export type ToolEventDocument = HydratedDocument<ToolEvent>;

@Schema({ timestamps: true })
export class ToolEvent {
  @Prop({ type: String, ref: "Tool", required: true, index: true })
  toolId: string;

  @Prop({ type: String, ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ enum: ToolEventType, required: true })
  type: ToolEventType;

  @Prop({ type: String, ref: "User", default: null })
  fromUserId?: string | null;

  @Prop({ type: String, ref: "User", default: null })
  toUserId?: string | null;

  @Prop({ type: String, ref: "Project", default: null })
  projectId?: string | null;

  // For inspections/repairs: ok / needs_service / broken.
  @Prop({ default: "" })
  condition: string;

  @Prop({ default: "" })
  note: string;

  // Who performed the action.
  @Prop({ type: String, ref: "User", default: null })
  byUserId?: string | null;
}

export const ToolEventSchema = SchemaFactory.createForClass(ToolEvent);

ToolEventSchema.index({ toolId: 1, createdAt: -1 });
