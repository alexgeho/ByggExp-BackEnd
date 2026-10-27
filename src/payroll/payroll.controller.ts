import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Response } from "express";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import {
  CreatePayrollRunDto,
  ManualPayrollRunDto,
} from "./dto/create-payroll-run.dto";
import { PayrollStatus } from "./schemas/payroll-run.schema";
import { PayrollService } from "./payroll.service";

@Controller("payroll")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get()
  findAll(@Request() req) {
    return this.payrollService.findAll(req.user);
  }

  @Post()
  create(@Request() req, @Body() dto: CreatePayrollRunDto) {
    return this.payrollService.create(dto, req.user);
  }

  // Manual run: hours / månadslön / other rows entered per worker.
  @Post("manual")
  createManual(@Request() req, @Body() dto: ManualPayrollRunDto) {
    return this.payrollService.createManual(dto, req.user);
  }

  @Put(":id/manual")
  updateManual(
    @Request() req,
    @Param("id") id: string,
    @Body() dto: ManualPayrollRunDto,
  ) {
    return this.payrollService.updateManual(id, dto, req.user);
  }

  // AGI for a month the pay went out (YYYYMM): summary + blocking problems.
  @Get("agi/:period")
  async agi(@Request() req, @Param("period") period: string) {
    const { summary, problems } = await this.payrollService.agi(
      period,
      req.user,
    );
    return { ...summary, problems };
  }

  @Get("agi/:period/xml")
  async agiXml(
    @Request() req,
    @Param("period") period: string,
    @Res() res: Response,
  ) {
    const xml = await this.payrollService.agiXml(period, req.user);
    res.set({
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename=agi-${period}.xml`,
    });
    res.end(xml);
  }

  @Get(":id")
  findOne(@Request() req, @Param("id") id: string) {
    return this.payrollService.findOne(id, req.user);
  }

  @Get(":id/payslip/:userId")
  async payslip(
    @Request() req,
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.payrollService.buildPayslipPdf(id, userId, req.user);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=lonespec-${userId}.pdf`,
      "Content-Length": pdf.length,
    });
    res.end(pdf);
  }

  @Patch(":id/status")
  setStatus(
    @Request() req,
    @Param("id") id: string,
    @Body() body: { status: PayrollStatus },
  ) {
    if (!Object.values(PayrollStatus).includes(body?.status)) {
      throw new BadRequestException("Invalid status");
    }
    return this.payrollService.setStatus(id, req.user, body.status);
  }

  @Delete(":id")
  remove(@Request() req, @Param("id") id: string) {
    return this.payrollService.remove(id, req.user);
  }
}
