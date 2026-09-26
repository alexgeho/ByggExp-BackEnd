import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { MongooseModule } from "@nestjs/mongoose";
import { Company, CompanySchema } from "../company/schemas/company.schema";
import { Shift, ShiftSchema } from "../shifts/schemas/shift.schema";
import { User, UserSchema } from "../users/schemas/user.schema";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { SubscriptionInterceptor } from "./subscription.interceptor";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: User.name, schema: UserSchema },
      { name: Shift.name, schema: ShiftSchema },
    ]),
  ],
  controllers: [BillingController],
  providers: [
    BillingService,
    // Global soft paywall (inert unless BILLING_ENFORCED=true).
    { provide: APP_INTERCEPTOR, useClass: SubscriptionInterceptor },
  ],
  exports: [BillingService],
})
export class BillingModule {}
