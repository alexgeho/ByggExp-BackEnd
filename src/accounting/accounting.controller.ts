import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { AccountingService } from "./accounting.service";
import { LedgerService } from "./ledger.service";

const ymd = (d: Date) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;

@Controller("accounting")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
export class AccountingController {
  constructor(
    private readonly service: AccountingService,
    private readonly ledger: LedgerService,
  ) {}

  // Bokföring: SIE4 import (one fiscal year per file) + balances/verifications.
  @Post("ledger/import")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  importSie(
    @Request() req,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
  ) {
    if (!file) throw new BadRequestException("No file");
    return this.ledger.importSie(req.user, file.buffer, file.originalname);
  }

  @Get("ledger")
  years(@Request() req) {
    return this.ledger.years(req.user);
  }

  @Get("ledger/:start/balances")
  balances(@Request() req, @Param("start") start: string) {
    return this.ledger.balances(req.user, start);
  }

  @Get("ledger/:start/verifications")
  verifications(
    @Request() req,
    @Param("start") start: string,
    @Query("account") account?: string,
  ) {
    return this.ledger.verifications(
      req.user,
      start,
      Number(account) || undefined,
    );
  }

  // SIE4 export for Fortnox / Visma / BL. types is a comma list: "invoices",
  // "suppliers" (default: both). from/to are inclusive ISO dates (YYYY-MM-DD).
  @Get("sie")
  async exportSie(
    @Request() req,
    @Res() res: Response,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("types") types?: string,
  ) {
    const selected = (types || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const includeInvoices = selected.length
      ? selected.includes("invoices")
      : true;
    const includeSuppliers = selected.length
      ? selected.includes("suppliers")
      : true;

    const { buffer, filename } = await this.service.buildSieExport(
      req.user,
      { from, to, includeInvoices, includeSuppliers },
      ymd(new Date()),
    );

    res.set({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename=${filename}`,
      "Content-Length": buffer.length,
    });
    res.end(buffer);
  }
}
