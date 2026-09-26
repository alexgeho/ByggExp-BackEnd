import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  Newsletter,
  NewsletterSchema,
} from "../newsletters/schemas/newsletter.schema";
import { MailerCampaignsService } from "./mailer-campaigns.service";
import { MailerListsService } from "./mailer-lists.service";
import { MailerSettingsService } from "./mailer-settings.service";
import { MailerController, MailerPublicController } from "./mailer.controller";
import {
  Campaign,
  CampaignRecipient,
  CampaignRecipientSchema,
  CampaignSchema,
  MailerSettings,
  MailerSettingsSchema,
  MailEvent,
  MailEventSchema,
  MailingList,
  MailingListSchema,
  Subscriber,
  SubscriberSchema,
  Suppression,
  SuppressionSchema,
} from "./schemas/mailer.schemas";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MailingList.name, schema: MailingListSchema },
      { name: Subscriber.name, schema: SubscriberSchema },
      { name: Suppression.name, schema: SuppressionSchema },
      { name: Campaign.name, schema: CampaignSchema },
      { name: CampaignRecipient.name, schema: CampaignRecipientSchema },
      { name: MailEvent.name, schema: MailEventSchema },
      { name: MailerSettings.name, schema: MailerSettingsSchema },
      { name: Newsletter.name, schema: NewsletterSchema },
    ]),
  ],
  controllers: [MailerController, MailerPublicController],
  providers: [
    MailerListsService,
    MailerCampaignsService,
    MailerSettingsService,
  ],
})
export class MailerModule {}
