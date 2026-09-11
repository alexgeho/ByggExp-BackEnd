import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { PlanningEntriesController } from "./planning-entries.controller";
import { PlanningEntriesService } from "./planning-entries.service";
import {
  PlanningEntry,
  PlanningEntrySchema,
} from "./schemas/planning-entry.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlanningEntry.name, schema: PlanningEntrySchema },
    ]),
  ],
  controllers: [PlanningEntriesController],
  providers: [PlanningEntriesService],
  exports: [PlanningEntriesService],
})
export class PlanningEntriesModule {}
