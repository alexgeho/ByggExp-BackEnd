import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CompanyDocument = Company & Document;

@Schema({ timestamps: true })
export class Company {
  @Prop({ default: '' })
  name: string;

  @Prop({ default: '' })
  address: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ default: '' })
  city: string;

  @Prop({ default: '' })
  phone: string;

  @Prop({ default: '' })
  website: string;

  @Prop({ default: '' })
  orgNumber: string;

  @Prop({ default: '' })
  vatNumber: string;

  @Prop({ default: '' })
  vatStatus: string;

  // Relative URL under /uploads (e.g. /uploads/company-logos/xyz.png); shown on
  // invoice/offer PDFs as the sender logo.
  @Prop({ default: '' })
  logoUrl: string;

  @Prop({ type: [String], ref: 'User', default: [] })
  companyAdmins: string[];

  @Prop({ type: [String], ref: 'Project', default: [] })
  projects: string[];
}

export const CompanySchema = SchemaFactory.createForClass(Company);