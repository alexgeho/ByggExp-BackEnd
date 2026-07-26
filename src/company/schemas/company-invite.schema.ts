import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { UserRole } from '../../users/schemas/user.schema';

export type CompanyInviteDocument = CompanyInvite & Document;

// A pending invitation to become a company's admin. No User exists until the
// invitee accepts (sets their own password) — company creation must not create
// a user account.
@Schema({ timestamps: true })
export class CompanyInvite {
  @Prop({ ref: 'Company', required: true, index: true })
  companyId: string;

  @Prop({ required: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ default: '' })
  name: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.CompanyAdmin })
  role: UserRole;

  @Prop({ required: true, unique: true, index: true })
  token: string;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  acceptedAt?: Date | null;

  @Prop({ type: String, ref: 'User', default: null })
  invitedByUserId?: string | null;
}

export const CompanyInviteSchema = SchemaFactory.createForClass(CompanyInvite);
