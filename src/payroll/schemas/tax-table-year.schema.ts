import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

// One income year of Skatteverket's monthly tax tables, imported from their
// machine-readable file. Rows are stored compactly as
// [table, from, to (-1 = open), percent (0/1), col1 … col6].
export type TaxTableYearDocument = HydratedDocument<TaxTableYear>;

@Schema({ timestamps: true })
export class TaxTableYear {
  @Prop({ type: Number, required: true, unique: true })
  year: number;

  @Prop({ default: '' })
  sourceUrl: string;

  // sha256 of the downloaded file, so a re-download of the same file is a no-op.
  @Prop({ default: '' })
  checksum: string;

  @Prop({ type: Number, default: 0 })
  rowCount: number;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  rows: number[][];

  @Prop({ type: Date, default: null })
  importedAt?: Date | null;

  // 'auto' (scheduled import) or the superadmin's user id.
  @Prop({ default: 'auto' })
  importedBy: string;
}

export const TaxTableYearSchema = SchemaFactory.createForClass(TaxTableYear);
