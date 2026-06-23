import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  findAllAccessible(@Request() req) {
    return this.invoicesService.findAccessible(req.user);
  }

  @Get('next-number')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  getNextInvoiceNumber(@Request() req, @Query('companyId') companyId?: string) {
    return this.invoicesService.getNextInvoiceNumberForUser(req.user, companyId);
  }

  @Post()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  create(@Request() req, @Body() createInvoiceDto: CreateInvoiceDto) {
    return this.invoicesService.create(createInvoiceDto, req.user);
  }

  @Post(':id/copy')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  copy(@Request() req, @Param('id') id: string) {
    return this.invoicesService.copy(id, req.user);
  }

  @Get(':id/html')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  @Header('Content-Type', 'text/html; charset=utf-8')
  previewHtml(@Request() req, @Param('id') id: string) {
    return this.invoicesService.buildInvoiceHtml(id, req.user);
  }

  @Get(':id/pdf')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  async downloadPdf(@Request() req, @Param('id') id: string, @Res() res: Response) {
    const invoice = await this.invoicesService.findOne(id, req.user);
    const pdfBuffer = await this.invoicesService.buildInvoicePdf(id, req.user);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Get(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  findOne(@Request() req, @Param('id') id: string) {
    return this.invoicesService.findOne(id, req.user);
  }

  @Put(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(id, updateInvoiceDto, req.user);
  }

  @Delete(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  remove(@Request() req, @Param('id') id: string) {
    return this.invoicesService.remove(id, req.user);
  }
}
