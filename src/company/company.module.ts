import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Company, CompanySchema } from "./schemas/company.schema";
import {
  CompanyInvite,
  CompanyInviteSchema,
} from "./schemas/company-invite.schema";
import { CompanyController } from "./company.controller";
import { CompanyInviteController } from "./company-invite.controller";
import { CompanyService } from "./company.service";
import { UsersModule } from "../users/users.module";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: CompanyInvite.name, schema: CompanyInviteSchema },
    ]),
    UsersModule,
    MailModule,
  ],
  controllers: [CompanyController, CompanyInviteController],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
