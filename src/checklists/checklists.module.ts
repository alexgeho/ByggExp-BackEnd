import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Company, CompanySchema } from "../company/schemas/company.schema";
import { Project, ProjectSchema } from "../projects/schemas/project.schema";
import { ChecklistsController } from "./checklists.controller";
import { ChecklistsService } from "./checklists.service";
import { Checklist, ChecklistSchema } from "./schemas/checklist.schema";
import {
  ChecklistTemplate,
  ChecklistTemplateSchema,
} from "./schemas/checklist-template.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChecklistTemplate.name, schema: ChecklistTemplateSchema },
      { name: Checklist.name, schema: ChecklistSchema },
      { name: Company.name, schema: CompanySchema },
      { name: Project.name, schema: ProjectSchema },
    ]),
  ],
  controllers: [ChecklistsController],
  providers: [ChecklistsService],
  exports: [ChecklistsService],
})
export class ChecklistsModule {}
