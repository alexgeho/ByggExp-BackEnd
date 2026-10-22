import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import {
  AgreementRuleSetDto,
  PayrollSettingsDto,
  WageBasisQueryDto,
  WageExportQueryDto,
} from './dto/agreement-rule-set.dto';
import { WageBasisService } from './wage-basis.service';

// Lönerunderlag enligt kollektivavtal + export to the company's payroll system.
// Its own prefix so the routes never collide with PayrollController's
// `payroll/:id`.
@Controller('payroll-basis')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
export class WageBasisController {
  constructor(private readonly wageBasisService: WageBasisService) {}

  @Get()
  build(@Request() req, @Query() query: WageBasisQueryDto) {
    return this.wageBasisService.buildBasis(query.from, query.to, req.user);
  }

  @Get('export')
  async export(
    @Request() req,
    @Query() query: WageExportQueryDto,
    @Res() res: Response,
  ) {
    const { content, contentType, skipped, filename } =
      await this.wageBasisService.exportBasis(
        query.from,
        query.to,
        req.user,
        query.format,
      );
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename=${filename}`,
      // Lets the admin warn about people/items left out without a second call.
      'X-Export-Skipped': encodeURIComponent(JSON.stringify(skipped)),
      'Access-Control-Expose-Headers': 'X-Export-Skipped, Content-Disposition',
    });
    res.end(content);
  }

  @Get('settings')
  getSettings(@Request() req) {
    return this.wageBasisService.getSettings(req.user);
  }

  @Put('settings')
  updateSettings(@Request() req, @Body() dto: PayrollSettingsDto) {
    return this.wageBasisService.updateSettings(dto, req.user);
  }

  @Get('rules')
  listRules(@Request() req) {
    return this.wageBasisService.listRuleSets(req.user);
  }

  // Agreement versions are shared by every company, so only a superadmin
  // writes them.
  @Post('rules')
  @Roles(UserRole.SuperAdmin)
  createRule(@Body() dto: AgreementRuleSetDto) {
    return this.wageBasisService.createRuleSet(dto);
  }

  @Post('rules/:id/duplicate')
  @Roles(UserRole.SuperAdmin)
  duplicateRule(@Param('id') id: string) {
    return this.wageBasisService.duplicateRuleSet(id);
  }

  @Patch('rules/:id')
  @Roles(UserRole.SuperAdmin)
  updateRule(@Param('id') id: string, @Body() dto: AgreementRuleSetDto) {
    return this.wageBasisService.updateRuleSet(id, dto);
  }

  @Post('rules/:id/publish')
  @Roles(UserRole.SuperAdmin)
  publishRule(@Request() req, @Param('id') id: string) {
    return this.wageBasisService.publishRuleSet(id, req.user);
  }

  @Delete('rules/:id')
  @Roles(UserRole.SuperAdmin)
  removeRule(@Param('id') id: string) {
    return this.wageBasisService.removeRuleSet(id);
  }
}
