import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  Subcontractor,
  SubcontractorSchema,
} from "./schemas/subcontractor.schema";
import { SubcontractorsController } from "./subcontractors.controller";
import { SubcontractorsService } from "./subcontractors.service";
import { User, UserSchema } from "../users/schemas/user.schema";
import { Company, CompanySchema } from "../company/schemas/company.schema";
import { UsersModule } from "../users/users.module";
import { CompanyModule } from "../company/company.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subcontractor.name, schema: SubcontractorSchema },
      { name: User.name, schema: UserSchema },
      { name: Company.name, schema: CompanySchema },
    ]),
    UsersModule,
    CompanyModule,
  ],
  controllers: [SubcontractorsController],
  providers: [SubcontractorsService],
})
export class SubcontractorsModule {}
