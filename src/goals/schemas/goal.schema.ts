import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type GoalDocument = Goal & Document;

// One stage of a decomposed goal. Holds references to existing project Tasks;
// progress (% and stage status) is derived from those tasks' statuses.
@Schema({ _id: true, timestamps: false })
export class GoalStage {
  @Prop({ default: "" })
  title: string;

  @Prop({ type: [String], ref: "Task", default: [] })
  taskIds: string[];

  @Prop({ type: Number, default: 0 })
  order: number;
}

export const GoalStageSchema = SchemaFactory.createForClass(GoalStage);

// A project goal decomposed into an ordered list of stages. One goal per
// project (the project's objective broken into milestones).
@Schema({ timestamps: true })
export class Goal {
  @Prop({ ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ ref: "Project", required: true, unique: true, index: true })
  projectId: string;

  @Prop({ default: "" })
  title: string;

  @Prop({ type: [GoalStageSchema], default: [] })
  stages: GoalStage[];
}

export const GoalSchema = SchemaFactory.createForClass(Goal);
