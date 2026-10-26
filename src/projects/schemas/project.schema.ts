import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema } from "mongoose";

export type ProjectDocument = Project & Document;

export class ProjectDocumentFile {
  name: string;
  url: string;
  mimeType?: string;
  size?: number;
  uploadedAt?: Date;
  uploadedBy?: string;
  uploadedByName?: string;
}

export class ProjectShiftSchedule {
  enabled: boolean;
  workDayStartTime: string;
  workDayEndTime: string;
  startGraceMinutes: number;
  endGraceMinutes: number;
  lunchMinutes: number;
  timezone: string;
}

@Schema({ timestamps: true })
export class Project {
  @Prop({ required: true, ref: "Company" })
  companyId: string;

  // Optional customer the project is carried out for. Belongs to
  // the same company (tenant) as the project. Not required to create a project.
  @Prop({ type: String, ref: "Client", default: null })
  clientId?: string | null;

  @Prop({ required: true, ref: "User" })
  ownerId: string;

  @Prop({ required: true, ref: "User" })
  projectManagerId: string;

  @Prop({ type: [String], ref: "User", default: [] })
  projectAdmins: string[];

  @Prop({ required: true })
  name: string;

  // The company's "Intern tid" project: time not spent at a customer's site
  // (grossist run, workshop, service, training). Every worker is a member; its
  // hours go to payroll but never onto an invoice. One per company.
  @Prop({ type: Boolean, default: false, index: true })
  internal: boolean;

  @Prop({
    required: true,
    enum: ["planning", "in_progress", "completed", "on_hold"],
  })
  status: string;

  @Prop()
  location: string;

  @Prop({ type: Number })
  locationLatitude?: number;

  @Prop({ type: Number })
  locationLongitude?: number;

  @Prop({ type: Number, default: 500 })
  locationRadiusMeters?: number;

  @Prop({
    type: {
      _id: false,
      enabled: { type: Boolean, default: false },
      workDayStartTime: { type: String, default: "07:00" },
      workDayEndTime: { type: String, default: "16:00" },
      startGraceMinutes: { type: Number, default: 30 },
      endGraceMinutes: { type: Number, default: 30 },
      lunchMinutes: { type: Number, default: 60 },
      timezone: { type: String, default: "Europe/Oslo" },
    },
    default: undefined,
  })
  shiftSchedule?: ProjectShiftSchedule;

  @Prop()
  contractNumber: string;

  // Littera / customer order reference (e.g. "100014"); flows to the invoice's
  // order reference and into hour-invoice descriptions.
  @Prop({ default: "" })
  littera: string;

  // Kind of job: a normal project or a work order (service, installation,
  // jour call-out, warranty). Used to filter the list and follow up profit.
  @Prop({
    enum: ["project", "service", "installation", "jour", "garanti"],
    default: "project",
  })
  orderType: string;

  @Prop({ type: Date })
  beginningDate: Date;

  @Prop({ type: Date })
  endDate: Date;

  @Prop({ type: Number })
  budget?: number;

  @Prop({ type: Number })
  plannedHours?: number;

  @Prop({ type: Number })
  plannedMaterialsCost?: number;

  @Prop({ type: Number })
  spentMaterialsCost?: number;

  // Two hourly rates for labour. costRatePerHour = självkostnad (what an hour
  // costs the company: lön + sociala avgifter) → drives project cost & margin.
  // billRatePerHour = debiteras (what the customer is charged per hour) →
  // billable labour and offer pricing. 0 = not set (fall back to per-employee).
  @Prop({ type: Number, default: 0 })
  costRatePerHour?: number;

  @Prop({ type: Number, default: 0 })
  billRatePerHour?: number;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  documents: Array<string | ProjectDocumentFile>;

  @Prop({ type: [String], ref: "Task", default: [] })
  tasks: string[];

  @Prop({ type: [String], ref: "User", default: [] })
  workers: string[];

  @Prop()
  description: string;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);

// At most one "Intern tid" project per company (concurrent first loads upsert).
ProjectSchema.index(
  { companyId: 1, internal: 1 },
  { unique: true, partialFilterExpression: { internal: true } },
);
