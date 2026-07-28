import {
  Controller,
  Get,
  Query,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Response } from "express";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { AccountingService } from "./accounting.service";

const ymd = (d: Date) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;

@Controller("accounting")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
export class AccountingController {
  constructor(private readonly service: AccountingService) {}

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
