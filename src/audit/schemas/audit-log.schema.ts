import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type AuditLogDocument = HydratedDocument<AuditLog>;

// One row per mutating request: who did what, to which resource, and whether it
// succeeded. Written automatically by AuditInterceptor. Metadata only — no
// request bodies are stored, so no passwords / personnummer end up here.
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: "audit_logs" })
export class AuditLog {
  @Prop({ type: String, default: null, index: true })
  companyId?: string | null;

  @Prop({ type: String, default: null, index: true })
  userId?: string | null;

  @Prop({ default: "" })
  userEmail: string;

  @Prop({ default: "" })
  userRole: string;

  // HTTP verb: POST | PUT | PATCH | DELETE.
  @Prop({ default: "" })
  method: string;

  @Prop({ default: "" })
  path: string;

  // Coarse resource type derived from the path, e.g. "invoices", "users".
  @Prop({ type: String, default: null, index: true })
  entityType?: string | null;

  @Prop({ type: String, default: null })
  entityId?: string | null;

  @Prop({ type: Number, default: 0 })
  statusCode: number;

  @Prop({ type: Boolean, default: true })
  success: boolean;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ companyId: 1, createdAt: -1 });
