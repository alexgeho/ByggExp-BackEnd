import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { MailModule } from "../mail/mail.module";
import { NewslettersController } from "./newsletters.controller";
import { NewslettersService } from "./newsletters.service";
import { Newsletter, NewsletterSchema } from "./schemas/newsletter.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Newsletter.name, schema: NewsletterSchema },
    ]),
    MailModule,
  ],
  controllers: [NewslettersController],
  providers: [NewslettersService],
})
export class NewslettersModule {}
