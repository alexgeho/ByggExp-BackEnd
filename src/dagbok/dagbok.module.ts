import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { DagbokController } from "./dagbok.controller";
import { DagbokService } from "./dagbok.service";
import { DagbokEntry, DagbokSchema } from "./schemas/dagbok.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DagbokEntry.name, schema: DagbokSchema },
    ]),
  ],
  controllers: [DagbokController],
  providers: [DagbokService],
  exports: [DagbokService],
})
export class DagbokModule {}
