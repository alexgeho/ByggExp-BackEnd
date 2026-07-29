import { Module } from "@nestjs/common";
import { SystemController } from "./system.controller";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [MailModule],
  controllers: [SystemController],
})
export class SystemModule {}
