import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

// One company's link to its Fortnox account. Tokens are encrypted at rest
// (fortnox-crypto) and never leave the backend.
export type FortnoxConnectionDocument = HydratedDocument<FortnoxConnection>;

@Schema({ timestamps: true })
export class FortnoxConnection {
  @Prop({ type: String, ref: "Company", required: true, unique: true })
  companyId: string;

  @Prop({ default: "" })
  accessTokenEnc: string;

  @Prop({ default: "" })
  refreshTokenEnc: string;

  @Prop({ type: Date, default: null })
  accessTokenExpiresAt?: Date | null;

  @Prop({ default: "" })
  scope: string;

  @Prop({ default: "" })
  fortnoxCompanyName: string;

  @Prop({ default: "" })
  fortnoxOrgNumber: string;

  @Prop({ type: String, ref: "User", default: null })
  connectedByUserId?: string | null;

  @Prop({ type: Date, default: null })
  connectedAt?: Date | null;

  // Set when Fortnox rejects the refresh token (revoked / expired after 45
  // days unused): the company has to connect again.
  @Prop({ type: Boolean, default: false })
  needsReconnect: boolean;

  // Last supplier-invoice import (Fortnox lastmodified filter).
  @Prop({ type: Date, default: null })
  supplierSyncAt?: Date | null;
}

export const FortnoxConnectionSchema =
  SchemaFactory.createForClass(FortnoxConnection);
