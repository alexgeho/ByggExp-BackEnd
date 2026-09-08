import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type ProjektkalkylDocument = Projektkalkyl & Document;

// A standalone project calculation (budget board): two sides (income/expense),
// each with any number of named, coloured tables the user fills in by hand.
// The whole board layout (tables/columns/rows) is stored as flexible JSON — all
// the calc logic lives in the admin app; the backend just persists it.
@Schema({ timestamps: true })
export class Projektkalkyl {
  @Prop({ ref: "Company", required: true, index: true })
  companyId: string;

  @Prop({ ref: "User", required: true })
  createdByUserId: string;

  @Prop({ default: "" })
  name: string;

  @Prop({ default: "" })
  note?: string;

  // Array of table objects:
  // { id, side: 'income'|'expense', title, color, vatMode: 'inkl25'|'none',
  //   columns: [{ id, label, type: 'text'|'date'|'amount' }],
  //   rows: [{ id, cells: { [columnId]: string|number } }] }
  @Prop({ type: [Object], default: [] })
  tables: Record<string, unknown>[];

  // Public read-only share: a random token + expiry (self-destructs after 1h).
  @Prop({ default: "", index: true })
  shareToken: string;

  @Prop({ type: Date, default: null })
  shareExpiresAt: Date | null;

  // Discussion: [{ id, authorName, text, guest, createdAt }]
  @Prop({ type: [Object], default: [] })
  comments: Record<string, unknown>[];
}

export const ProjektkalkylSchema = SchemaFactory.createForClass(Projektkalkyl);

ProjektkalkylSchema.index({ companyId: 1, createdAt: -1 });
