import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { OffersController } from "./offers.controller";
import { OffersService } from "./offers.service";
import { Offer, OfferSchema } from "./schemas/offer.schema";
import { Company, CompanySchema } from "../company/schemas/company.schema";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Offer.name, schema: OfferSchema },
      { name: Company.name, schema: CompanySchema },
    ]),
    MailModule,
  ],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
