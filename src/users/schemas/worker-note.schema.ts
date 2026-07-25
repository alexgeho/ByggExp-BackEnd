import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WorkerNoteDocument = WorkerNote & Document;

@Schema({ timestamps: true })
export class WorkerNote {
  @Prop({ required: true, index: true, ref: 'User' })
  workerId: string;

  @Prop({ required: true, index: true, ref: 'User' })
  authorUserId: string;

  @Prop({ default: '' })
  authorName: string;

  @Prop({ default: '' })
  authorRole: string;

  @Prop({ default: '' })
  companyId?: string;

  @Prop({ required: true, trim: true })
  text: string;
}

export const WorkerNoteSchema = SchemaFactory.createForClass(WorkerNote);
