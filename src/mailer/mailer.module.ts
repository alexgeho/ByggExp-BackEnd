import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  Newsletter,
  NewsletterSchema,
} from "../newsletters/schemas/newsletter.schema";
import { Company, CompanySchema } from "../company/schemas/company.schema";
import { User, UserSchema } from "../users/schemas/user.schema";
import { MailerCampaignsService } from "./mailer-campaigns.service";
import { MailerFunnelService } from "./mailer-funnel.service";
import { MailerListsService } from "./mailer-lists.service";
import { MailerSettingsService } from "./mailer-settings.service";
import { MailerController, MailerPublicController } from "./mailer.controller";
import {
  Campaign,
  CampaignRecipient,
  CampaignRecipientSchema,
  CampaignSchema,
  MailerFunnelConfig,
  MailerFunnelConfigSchema,
  MailerSettings,
  MailerSettingsSchema,
  MailReply,
  MailReplySchema,
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
      { name: MailReply.name, schema: MailReplySchema },
      { name: MailerFunnelConfig.name, schema: MailerFunnelConfigSchema },
      { name: Company.name, schema: CompanySchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [MailerController, MailerPublicController],
  providers: [
    MailerListsService,
    MailerCampaignsService,
    MailerSettingsService,
    MailerFunnelService,
  ],
})
export class MailerModule {}
