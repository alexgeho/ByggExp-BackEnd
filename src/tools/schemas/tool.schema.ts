import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ToolDocument = Tool & Document;

@Schema({ timestamps: true })
export class Tool {
  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  photoUrl: string;

  @Prop({ type: [String], default: [] })
  photoUrls: string[];

  @Prop({ default: '' })
  notes: string;

  @Prop({ type: [String], default: [] })
  workerIds: string[];

  @Prop({ type: [String], default: [] })
  projectIds: string[];

  @Prop({ ref: 'Company' })
  companyId?: string;
}

export const ToolSchema = SchemaFactory.createForClass(Tool);
