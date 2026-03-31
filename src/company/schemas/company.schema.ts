import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CompanyDocument = Company & Document;

@Schema({ timestamps: true })
export class Company {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  address: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ type: [String], ref: 'User', default: [] })
  companyAdmins: string[];

  @Prop({ type: [String], ref: 'Project', default: [] })
  projects: string[];
}

export const CompanySchema = SchemaFactory.createForClass(Company);