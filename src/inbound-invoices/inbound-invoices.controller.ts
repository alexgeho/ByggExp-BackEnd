import {
  BadRequestException,
  Controller,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { AnyFilesInterceptor } from "@nestjs/platform-express";
import { Public } from "../common/decorators/public.decorator";
import { InboundInvoicesService } from "./inbound-invoices.service";

interface UploadedInboundFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

// Machine-to-machine intake for forwarded invoice e-mails. A mail provider
// (inbound parse) or forwarding rule POSTs the message with its attachments
// here. It is @Public (no JWT) but gated by a shared secret token, and stays
// completely disabled until INBOUND_INVOICE_TOKEN is configured in the
// environment — so it is inert and safe by default.
@Controller("inbound/supplier-invoices")
export class InboundInvoicesController {
  constructor(private readonly service: InboundInvoicesService) {}

  @Public()
  @Post()
  @UseInterceptors(AnyFilesInterceptor())
  async ingest(
    @Query("token") tokenQuery: string,
    @Query("companyId") companyId: string,
    @UploadedFiles() files: UploadedInboundFile[],
    @Req() req: { headers: Record<string, string | string[] | undefined> },
  ) {
    const configured = process.env.INBOUND_INVOICE_TOKEN || "";
    if (!configured) {
      throw new ServiceUnavailableException("Inbound invoice intake is not configured");
    }

    const headerToken = req.headers["x-inbound-token"];
    const provided = tokenQuery || (Array.isArray(headerToken) ? headerToken[0] : headerToken);
    if (!provided || provided !== configured) {
      throw new UnauthorizedException("Invalid inbound token");
    }

    if (!companyId) {
      throw new BadRequestException("companyId query parameter is required");
    }

    return this.service.ingest(companyId, files || []);
  }
}
