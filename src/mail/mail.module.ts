import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { MailController } from "./mail.controller";
import { MailService } from "./mail.service";
import { DemoLead, DemoLeadSchema } from "./schemas/demo-lead.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DemoLead.name, schema: DemoLeadSchema },
    ]),
  ],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
