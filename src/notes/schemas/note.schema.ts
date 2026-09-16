import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

// Anteckningar — personal notes. Each note belongs to one user and is scoped to
// their company (tenant); it is private to that user (no admin/company-wide
// sharing, unlike expenses).
export type NoteDocument = HydratedDocument<Note>;

@Schema({ timestamps: true })
export class Note {
  @Prop({ type: String, ref: "Company", required: true, index: true })
  companyId: string;

  // The owner — the only user who can see/edit this note.
  @Prop({ type: String, ref: "User", required: true, index: true })
  userId: string;

  @Prop({ default: "" })
  title: string;

  @Prop({ default: "" })
  body: string;
}

export const NoteSchema = SchemaFactory.createForClass(Note);
