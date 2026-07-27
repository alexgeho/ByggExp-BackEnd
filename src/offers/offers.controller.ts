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
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { CreateOfferDto } from "./dto/create-offer.dto";
import { UpdateOfferDto } from "./dto/update-offer.dto";
import { OffersService } from "./offers.service";

@Controller("offers")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Get()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  findAllAccessible(@Request() req) {
    return this.offersService.findAccessible(req.user);
  }

  @Get("next-number")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  getNextOfferNumber(@Request() req, @Query("companyId") companyId?: string) {
    return this.offersService.getNextOfferNumberForUser(req.user, companyId);
  }

  @Post()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  create(@Request() req, @Body() createOfferDto: CreateOfferDto) {
    return this.offersService.create(createOfferDto, req.user);
  }

  @Post(":id/copy")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  copy(@Request() req, @Param("id") id: string) {
    return this.offersService.copy(id, req.user);
  }

  @Get(":id/html")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  @Header("Content-Type", "text/html; charset=utf-8")
  previewHtml(@Request() req, @Param("id") id: string) {
    return this.offersService.buildOfferHtml(id, req.user);
  }

  @Get(":id/pdf")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
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
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  findOne(@Request() req, @Param("id") id: string) {
    return this.offersService.findOne(id, req.user);
  }

  @Put(":id")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  update(
    @Request() req,
    @Param("id") id: string,
    @Body() updateOfferDto: UpdateOfferDto,
  ) {
    return this.offersService.update(id, updateOfferDto, req.user);
  }

  @Delete(":id")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  remove(@Request() req, @Param("id") id: string) {
    return this.offersService.remove(id, req.user);
  }
}
