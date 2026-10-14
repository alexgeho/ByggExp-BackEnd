import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { MailService } from "./mail.service";
import { DemoLead, DemoLeadDocument } from "./schemas/demo-lead.schema";
import { SendDemoRequestDto } from "./dto/send-demo-request.dto";
import { Public } from "../common/decorators/public.decorator";

@Public()
@Controller("mail")
export class MailController {
  private readonly logger = new Logger(MailController.name);

  constructor(
    private readonly mailService: MailService,
    @InjectModel(DemoLead.name)
    private readonly leads: Model<DemoLeadDocument>,
  ) {}

  @Post("demo-request")
  @HttpCode(HttpStatus.ACCEPTED)
  async sendDemoRequest(@Body() dto: SendDemoRequestDto) {
    // Saving must never cost us the lead mail.
    await this.leads
      .create({
        name: dto["f-name"],
        email: dto["f-email"],
        phone: dto["f-phone"],
        source: dto["f-source"] || "",
        message: dto["f-message"] || "",
        utmSource: dto["f-utm-source"] || "",
        utmCampaign: dto["f-utm-campaign"] || "",
      })
      .catch((err) => this.logger.warn(`Demo lead not saved: ${err}`));
    await this.mailService.sendDemoRequestEmail({
      name: dto["f-name"],
      email: dto["f-email"],
      phone: dto["f-phone"],
      source: dto["f-source"],
      message: dto["f-message"],
    });

    return { success: true };
  }
}
