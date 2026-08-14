import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type PendingRegistrationDocument = PendingRegistration & Document;

// A self-serve company sign-up that hasn't confirmed its email yet. No real
// Company/User is created until the emailed code is verified — so spammed
// registrations never pollute the tenant data. Records auto-expire (TTL index).
@Schema({ timestamps: true })
export class PendingRegistration {
  @Prop({ required: true, lowercase: true, unique: true, index: true })
  email: string;

  @Prop({ required: true })
  companyName: string;

  @Prop({ required: true })
  userName: string;

  // bcrypt hash of the password the user chose — we never store the plaintext.
  @Prop({ required: true, select: false })
  passwordHash: string;

  // sha256 of the 6-digit verification code.
  @Prop({ required: true, select: false })
  codeHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: 0 })
  attempts: number;
}

export const PendingRegistrationSchema =
  SchemaFactory.createForClass(PendingRegistration);

// Mongo removes the document automatically once expiresAt passes.
PendingRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
