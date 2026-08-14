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

  @Prop({ default: "" })
  userName: string;

  // bcrypt hash of the password — set at step 2 (after email confirmation), so
  // it doesn't exist yet at sign-up. Never stores the plaintext.
  @Prop({ type: String, default: null, select: false })
  passwordHash?: string | null;

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
