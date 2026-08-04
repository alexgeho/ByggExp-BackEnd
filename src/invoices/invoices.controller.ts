import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Response } from "express";
import { Permissions } from "../common/decorators/permissions.decorator";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { PERMISSIONS } from "../common/permissions/permissions.constants";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { UpdateInvoiceDto } from "./dto/update-invoice.dto";
import { InvoiceStatus } from "./schemas/invoice.schema";
import { InvoicesService } from "./invoices.service";

@Controller("invoices")
@UseGuards(AuthGuard("jwt"), PermissionsGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  findAllAccessible(@Request() req) {
    return this.invoicesService.findAccessible(req.user);
  }

  @Get("next-number")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  getNextInvoiceNumber(@Request() req, @Query("companyId") companyId?: string) {
    return this.invoicesService.getNextInvoiceNumberForUser(
      req.user,
      companyId,
    );
  }

  @Post()
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  create(@Request() req, @Body() createInvoiceDto: CreateInvoiceDto) {
    return this.invoicesService.create(createInvoiceDto, req.user);
  }

  @Post(":id/copy")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  copy(@Request() req, @Param("id") id: string) {
    return this.invoicesService.copy(id, req.user);
  }

  @Post(":id/credit")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  creditNote(@Request() req, @Param("id") id: string) {
    return this.invoicesService.createCreditNote(id, req.user);
  }

  @Get(":id/html")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  @Header("Content-Type", "text/html; charset=utf-8")
  previewHtml(@Request() req, @Param("id") id: string) {
    return this.invoicesService.buildInvoiceHtml(id, req.user);
  }

  @Get(":id/pdf")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  async downloadPdf(
    @Request() req,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const invoice = await this.invoicesService.findOne(id, req.user);
    const pdfBuffer = await this.invoicesService.buildInvoicePdf(id, req.user);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`,
      "Content-Length": pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Post(":id/send")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  sendByEmail(
    @Request() req,
    @Param("id") id: string,
    @Body() body: { email?: string; message?: string },
  ) {
    return this.invoicesService.sendByEmail(
      id,
      req.user,
      body?.email,
      body?.message,
    );
  }

  @Patch(":id/status")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  setStatus(
    @Request() req,
    @Param("id") id: string,
    @Body() body: { status: InvoiceStatus },
  ) {
    if (!Object.values(InvoiceStatus).includes(body?.status)) {
      throw new BadRequestException("Invalid status");
    }
    return this.invoicesService.setStatus(id, req.user, body.status);
  }

  @Get(":id")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  findOne(@Request() req, @Param("id") id: string) {
    return this.invoicesService.findOne(id, req.user);
  }

  @Put(":id")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  update(
    @Request() req,
    @Param("id") id: string,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(id, updateInvoiceDto, req.user);
  }

  @Delete(":id")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  remove(@Request() req, @Param("id") id: string) {
    return this.invoicesService.remove(id, req.user);
  }
}
