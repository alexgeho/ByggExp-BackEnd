import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type DemoLeadDocument = DemoLead & Document & { createdAt: Date };

// Demo request from the site form — kept so the mailer funnel can count it.
@Schema({ timestamps: true })
export class DemoLead {
  @Prop({ default: "" })
  name: string;

  @Prop({ default: "", lowercase: true, trim: true })
  email: string;

  @Prop({ default: "" })
  phone: string;

  // Page the form was sent from (host + path).
  @Prop({ default: "" })
  source: string;

  @Prop({ default: "" })
  message: string;

  @Prop({ default: "" })
  utmSource: string;

  @Prop({ default: "" })
  utmCampaign: string;

  @Prop({ default: "" })
  utmMedium: string;

  // External page that sent the visitor; "" = direct or not tracked.
  @Prop({ default: "" })
  referrer: string;

  // First page of the visit; "" = lead from before tracking.
  @Prop({ default: "" })
  landing: string;
}

export const DemoLeadSchema = SchemaFactory.createForClass(DemoLead);
