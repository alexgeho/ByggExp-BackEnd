import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Goal, GoalSchema } from "./schemas/goal.schema";
import { Project, ProjectSchema } from "../projects/schemas/project.schema";
import { GoalsController } from "./goals.controller";
import { GoalsService } from "./goals.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Goal.name, schema: GoalSchema },
      { name: Project.name, schema: ProjectSchema },
    ]),
  ],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}
