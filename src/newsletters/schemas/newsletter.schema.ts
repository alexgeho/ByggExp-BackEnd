import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema } from "mongoose";

export type NewsletterDocument = Newsletter & Document;

// A newsletter draft built in the superadmin editor. Content is stored as
// structured blocks (see newsletter-render.ts) and rendered to HTML on demand.
@Schema({ timestamps: true })
export class Newsletter {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: "" })
  subject: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  settings: Record<string, unknown>;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  blocks: Record<string, unknown>[];

  @Prop({ type: String, default: null })
  updatedBy: string | null;
}

export const NewsletterSchema = SchemaFactory.createForClass(Newsletter);
