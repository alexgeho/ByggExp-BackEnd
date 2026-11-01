import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  Checklist,
  ChecklistSchema,
} from "../checklists/schemas/checklist.schema";
import { Company, CompanySchema } from "../company/schemas/company.schema";
import { DagbokEntry, DagbokSchema } from "../dagbok/schemas/dagbok.schema";
import { NotificationsModule } from "../notifications/notifications.module";
import { Project, ProjectSchema } from "../projects/schemas/project.schema";
import { User, UserSchema } from "../users/schemas/user.schema";
import { DeviationsController } from "./deviations.controller";
import { DeviationsService } from "./deviations.service";
import {
  Deviation,
  DeviationCounter,
  DeviationCounterSchema,
  DeviationSchema,
} from "./schemas/deviation.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Deviation.name, schema: DeviationSchema },
      { name: DeviationCounter.name, schema: DeviationCounterSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Company.name, schema: CompanySchema },
      { name: User.name, schema: UserSchema },
      { name: Checklist.name, schema: ChecklistSchema },
      { name: DagbokEntry.name, schema: DagbokSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [DeviationsController],
  providers: [DeviationsService],
  exports: [DeviationsService],
})
export class DeviationsModule {}
