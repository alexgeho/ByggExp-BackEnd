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
} from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "@nestjs/passport";
import { Permissions } from "../common/decorators/permissions.decorator";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { PERMISSIONS } from "../common/permissions/permissions.constants";
import { CreateOfferDto } from "./dto/create-offer.dto";
import { UpdateOfferDto } from "./dto/update-offer.dto";
import { OffersService } from "./offers.service";

@Controller("offers")
@UseGuards(AuthGuard("jwt"), PermissionsGuard)
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Get()
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  findAllAccessible(@Request() req) {
    return this.offersService.findAccessible(req.user);
  }

  @Get("next-number")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  getNextOfferNumber(@Request() req, @Query("companyId") companyId?: string) {
    return this.offersService.getNextOfferNumberForUser(req.user, companyId);
  }

  @Post()
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  create(@Request() req, @Body() createOfferDto: CreateOfferDto) {
    return this.offersService.create(createOfferDto, req.user);
  }

  @Post(":id/copy")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  copy(@Request() req, @Param("id") id: string) {
    return this.offersService.copy(id, req.user);
  }

  @Get(":id/html")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  @Header("Content-Type", "text/html; charset=utf-8")
  previewHtml(@Request() req, @Param("id") id: string) {
    return this.offersService.buildOfferHtml(id, req.user);
  }

  @Get(":id/pdf")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  async downloadPdf(
    @Request() req,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const offer = await this.offersService.findOne(id, req.user);
    const pdfBuffer = await this.offersService.buildOfferPdf(id, req.user);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=offer-${offer.offerNumber}.pdf`,
      "Content-Length": pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Get(":id")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  findOne(@Request() req, @Param("id") id: string) {
    return this.offersService.findOne(id, req.user);
  }

  @Put(":id")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  update(
    @Request() req,
    @Param("id") id: string,
    @Body() updateOfferDto: UpdateOfferDto,
  ) {
    return this.offersService.update(id, updateOfferDto, req.user);
  }

  @Delete(":id")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  remove(@Request() req, @Param("id") id: string) {
    return this.offersService.remove(id, req.user);
  }
}
