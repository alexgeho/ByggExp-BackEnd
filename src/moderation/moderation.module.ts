import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ModerationController } from "./moderation.controller";
import { ModerationService } from "./moderation.service";
import { UserBlock, UserBlockSchema } from "./schemas/user-block.schema";
import {
  ContentReport,
  ContentReportSchema,
} from "./schemas/content-report.schema";
import { Message, MessageSchema } from "../messages/schemas/message.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserBlock.name, schema: UserBlockSchema },
      { name: ContentReport.name, schema: ContentReportSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
  ],
  controllers: [ModerationController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
