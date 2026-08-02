import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
  @Prop({ required: true, ref: "Chat" }) // Ссылка на чат
  chatId: string;

  @Prop({ required: true, ref: "User" }) // Автор сообщения
  userId: string;

  // Text is optional: a message may be attachments-only.
  @Prop({ default: "" })
  text: string;

  // Photos/files attached to the message. kind is "image" or "file".
  @Prop({
    type: [
      {
        url: String,
        name: String,
        mimeType: String,
        kind: String,
      },
    ],
    default: [],
  })
  attachments: {
    url: string;
    name: string;
    mimeType: string;
    kind: string;
  }[];

  // Source language as detected on first translation (DeepL code, e.g. "PL").
  @Prop({ type: String, default: "" })
  sourceLang: string;

  // Cache of machine translations keyed by target language code (e.g. { SV,
  // EN }), so a message is only sent to the provider once per language.
  @Prop({ type: Object, default: {} })
  translations: Record<string, string>;

  @Prop({ type: Date, default: Date.now })
  timestamp: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ chatId: 1, timestamp: 1 });
MessageSchema.index({ userId: 1, timestamp: -1 });
