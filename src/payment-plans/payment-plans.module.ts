import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { PaymentPlansController } from "./payment-plans.controller";
import { PaymentPlansService } from "./payment-plans.service";
import { PaymentPlan, PaymentPlanSchema } from "./schemas/payment-plan.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PaymentPlan.name, schema: PaymentPlanSchema },
    ]),
  ],
  controllers: [PaymentPlansController],
  providers: [PaymentPlansService],
  exports: [PaymentPlansService],
})
export class PaymentPlansModule {}
