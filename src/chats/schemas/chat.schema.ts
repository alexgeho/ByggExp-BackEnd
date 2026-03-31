import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChatDocument = Chat & Document;

@Schema()
export class Chat {
  @Prop({ required: true, ref: 'User' }) // Владелец чата
  ownerId: string;

  @Prop({ type: [String], ref: 'User' }) // Участники чата
  members: string[];
}

export const ChatSchema = SchemaFactory.createForClass(Chat);