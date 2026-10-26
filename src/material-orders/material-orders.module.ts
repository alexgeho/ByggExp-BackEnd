import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { MailModule } from "../mail/mail.module";
import { Article, ArticleSchema } from "../articles/schemas/article.schema";
import { Project, ProjectSchema } from "../projects/schemas/project.schema";
import { Company, CompanySchema } from "../company/schemas/company.schema";
import { User, UserSchema } from "../users/schemas/user.schema";
import {
  MaterialOrder,
  MaterialOrderSchema,
} from "./schemas/material-order.schema";
import {
  MaterialSupplier,
  MaterialSupplierSchema,
} from "./schemas/material-supplier.schema";
import { MaterialOrdersController } from "./material-orders.controller";
import { MaterialOrdersService } from "./material-orders.service";
import { EmailOrderSender } from "./senders/email-order.sender";
import { ORDER_SENDER } from "./senders/order-sender";

@Module({
  imports: [
    MailModule,
    MongooseModule.forFeature([
      { name: MaterialOrder.name, schema: MaterialOrderSchema },
      { name: MaterialSupplier.name, schema: MaterialSupplierSchema },
      { name: Article.name, schema: ArticleSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Company.name, schema: CompanySchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [MaterialOrdersController],
  providers: [
    MaterialOrdersService,
    EmailOrderSender,
    // Swap for an EDI sender per supplier once an agreement exists.
    { provide: ORDER_SENDER, useExisting: EmailOrderSender },
  ],
})
export class MaterialOrdersModule {}
