import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../common/decorators/public.decorator";
import { Permissions } from "../common/decorators/permissions.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PERMISSIONS } from "../common/permissions/permissions.constants";
import { UserRole } from "../users/schemas/user.schema";
import { FortnoxPayrollDto } from "./dto/fortnox-payroll.dto";
import { FortnoxService } from "./fortnox.service";

// Fortnox integration: OAuth connect per company, invoices → Fortnox,
// lönerunderlag → Fortnox Lön. Auth is the global JwtAuthGuard, except the
// OAuth callback, which Fortnox calls in the user's browser (signed state).
@Controller("fortnox")
export class FortnoxController {
  constructor(private readonly fortnox: FortnoxService) {}

  // { configured, connected, needsReconnect, companyName, orgNumber, connectedAt, scopes }
  @Get("status")
  status(@Request() req) {
    return this.fortnox.status(req.user);
  }

  @Get("connect-url")
  @UseGuards(PermissionsGuard)
  @Permissions(PERMISSIONS.COMPANY_MANAGE)
  connectUrl(@Request() req) {
    return this.fortnox.connectUrl(req.user);
  }

  @Public()
  @Get("callback")
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string,
    @Res() res: Response,
  ) {
    const dest = await this.fortnox.handleCallback({ code, state, error });
    return res.redirect(302, dest);
  }

  @Delete("connection")
  @UseGuards(PermissionsGuard)
  @Permissions(PERMISSIONS.COMPANY_MANAGE)
  disconnect(@Request() req) {
    return this.fortnox.disconnect(req.user);
  }

  @Post("invoices/:id")
  @UseGuards(PermissionsGuard)
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  pushInvoice(@Request() req, @Param("id") id: string) {
    return this.fortnox.pushInvoice(id, req.user);
  }

  @Post("payroll")
  @UseGuards(RolesGuard)
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  pushPayroll(@Request() req, @Body() dto: FortnoxPayrollDto) {
    return this.fortnox.pushPayroll(
      dto.from,
      dto.to,
      req.user,
      dto.userIds || [],
      !!dto.force,
    );
  }
}
