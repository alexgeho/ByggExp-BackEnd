import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type SubcontractorDocument = Subcontractor & Document;

// A subcontractor firm (underentreprenör) hired by a company. Its workers are
// ordinary users of the company with `subcontractorId` set: they report hours
// in the app like everyone else, and the firm's contact person signs in to the
// admin with the "subcontractor" role and sees only the firm's own people.
@Schema({ timestamps: true })
export class Subcontractor {
  @Prop({ required: true, ref: "Company", index: true })
  companyId: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, default: "", trim: true })
  orgNumber?: string;

  @Prop({ type: String, default: "", trim: true })
  contactPerson?: string;

  @Prop({ type: String, default: "", trim: true, lowercase: true })
  email?: string;

  @Prop({ type: String, default: "", trim: true })
  phone?: string;

  // Kind of work the firm does (e.g. "Målare"); the default profession of its
  // people.
  @Prop({ type: String, default: "", trim: true })
  workType?: string;

  // The contact person's user account (role "subcontractor"), when invited.
  @Prop({ type: String, ref: "User", default: null })
  contactUserId?: string | null;

  @Prop({ type: String, ref: "User", default: null })
  createdByUserId?: string | null;
}

export const SubcontractorSchema = SchemaFactory.createForClass(Subcontractor);

SubcontractorSchema.index({ companyId: 1, name: 1 });
