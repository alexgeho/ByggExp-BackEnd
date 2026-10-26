import { Injectable } from "@nestjs/common";
import { MailService } from "../../mail/mail.service";
import { buildOrderEmail, buildQuickOrderCsv } from "../order-format";
import { OrderDispatch, OrderSender } from "./order-sender";

@Injectable()
export class EmailOrderSender implements OrderSender {
  readonly channel = "email";

  constructor(private readonly mail: MailService) {}

  isReady(): boolean {
    return this.mail.isConfigured();
  }

  async send({ to, replyTo, rows, context }: OrderDispatch): Promise<void> {
    const { subject, text, html } = buildOrderEmail(rows, context);
    await this.mail.sendHtmlEmail({
      to,
      replyTo,
      subject,
      text,
      html,
      attachments: [
        {
          filename: `bestallning-${context.orderNumber}.csv`,
          content: buildQuickOrderCsv(rows),
          contentType: "text/csv; charset=utf-8",
        },
      ],
    });
  }
}
