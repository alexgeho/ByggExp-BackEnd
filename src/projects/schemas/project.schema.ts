import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProjectDocument = Project & Document;

@Schema({ timestamps: true })
export class Project {
  @Prop({ required: true, ref: 'Company' })
  companyId: string;

  @Prop({ required: true, ref: 'User' })
  ownerId: string;

  @Prop({ required: true, ref: 'User' })
  projectManagerId: string;

  @Prop({ type: [String], ref: 'User', default: [] })
  projectAdmins: string[];

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: ['planning', 'in_progress', 'completed', 'on_hold'] })
  status: string;

  @Prop()
  location: string;

  @Prop()
  contractNumber: string;

  @Prop({ type: Date })
  beginningDate: Date;

  @Prop({ type: Date })
  endDate: Date;

  @Prop({ type: [String], default: [] })
  documents: string[];

  @Prop({ type: [String], ref: 'Task', default: [] })
  tasks: string[];

  @Prop({ type: [String], ref: 'User', default: [] })
  workers: string[];

  @Prop()
  description: string;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);