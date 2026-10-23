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
  Query,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import {
  AgreementRuleSetDto,
  ApplyRaiseDto,
  PayrollSettingsDto,
  RuleSourceDto,
  TaxTableImportDto,
  WageBasisQueryDto,
  WageExportQueryDto,
  WageRateDto,
} from './dto/agreement-rule-set.dto';
import { WageBasisService } from './wage-basis.service';
import { WageRatesService } from './wage-rates.service';
import { RuleWatchService } from './rule-watch.service';
import { TaxTableService } from './tax-table.service';
import { AgreementDraftService } from './agreement-draft.service';

type UploadedPdf = { buffer: Buffer; mimetype: string; originalname: string };

// Lönerunderlag enligt kollektivavtal + export to the company's payroll system.
// Its own prefix so the routes never collide with PayrollController's
// `payroll/:id`.
@Controller('payroll-basis')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
export class WageBasisController {
  constructor(
    private readonly wageBasisService: WageBasisService,
    private readonly wageRatesService: WageRatesService,
    private readonly ruleWatchService: RuleWatchService,
    private readonly taxTableService: TaxTableService,
    private readonly agreementDraftService: AgreementDraftService,
  ) {}

  // ---- Lönehistorik and agreement raises (company) -------------------------

  @Get('raises')
  pendingRaises(@Request() req) {
    return this.wageRatesService.pendingRaises(req.user);
  }

  @Get('raises/:ruleSetId/proposals')
  raiseProposals(@Request() req, @Param('ruleSetId') ruleSetId: string) {
    return this.wageRatesService.proposals(ruleSetId, req.user);
  }

  @Post('raises/apply')
  applyRaise(@Request() req, @Body() dto: ApplyRaiseDto) {
    return this.wageRatesService.applyRaise(dto, req.user);
  }

  @Post('raises/:ruleSetId/handled')
  markRaiseHandled(@Request() req, @Param('ruleSetId') ruleSetId: string) {
    return this.wageRatesService.markRaiseHandled(ruleSetId, req.user);
  }

  @Get('wage-rates/:userId')
  listRates(@Request() req, @Param('userId') userId: string) {
    return this.wageRatesService.listRates(userId, req.user);
  }

  @Post('wage-rates')
  addRate(@Request() req, @Body() dto: WageRateDto) {
    return this.wageRatesService.addRate(dto, req.user);
  }

  @Delete('wage-rates/:id')
  removeRate(@Request() req, @Param('id') id: string) {
    return this.wageRatesService.removeRate(id, req.user);
  }

  // ---- Regelbevakning and tax tables (superadmin) --------------------------

  @Get('watch/sources')
  @Roles(UserRole.SuperAdmin)
  listSources() {
    return this.ruleWatchService.list();
  }

  @Post('watch/sources')
  @Roles(UserRole.SuperAdmin)
  addSource(@Body() dto: RuleSourceDto) {
    return this.ruleWatchService.add({
      name: dto.name || '',
      url: dto.url || '',
      area: dto.area,
    });
  }

  @Patch('watch/sources/:id')
  @Roles(UserRole.SuperAdmin)
  updateSource(@Param('id') id: string, @Body() dto: RuleSourceDto) {
    return this.ruleWatchService.update(id, dto);
  }

  @Delete('watch/sources/:id')
  @Roles(UserRole.SuperAdmin)
  removeSource(@Param('id') id: string) {
    return this.ruleWatchService.remove(id);
  }

  @Post('watch/sources/:id/check')
  @Roles(UserRole.SuperAdmin)
  checkSource(@Param('id') id: string) {
    return this.ruleWatchService.checkOne(id);
  }

  @Post('watch/sources/:id/reviewed')
  @Roles(UserRole.SuperAdmin)
  reviewSource(@Request() req, @Param('id') id: string) {
    return this.ruleWatchService.markReviewed(id, req.user?.userId);
  }

  @Get('tax-tables')
  @Roles(UserRole.SuperAdmin)
  listTaxTables() {
    return this.taxTableService.listYears();
  }

  // Imports one year's tables; without a url the link is looked up on
  // Skatteverket's page.
  @Post('tax-tables/import')
  @Roles(UserRole.SuperAdmin)
  async importTaxTables(@Request() req, @Body() dto: TaxTableImportDto) {
    const url = dto.url || (await this.taxTableService.discoverFileUrl(dto.year));
    if (!url) {
      throw new BadRequestException(
        `No ${dto.year} tax table file found on Skatteverket's page`,
      );
    }
    return this.taxTableService.importFromUrl(dto.year, url, req.user?.userId);
  }

  @Post('rules/draft-from-document')
  @Roles(UserRole.SuperAdmin)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }),
  )
  draftFromDocument(
    @UploadedFile() file: UploadedPdf | undefined,
    @Body() body: { text?: string; sourceLabel?: string },
  ) {
    return this.agreementDraftService.draftFromDocument({
      file,
      text: body?.text,
      sourceLabel: body?.sourceLabel,
    });
  }

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
  publishRule(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { confirmed?: boolean },
  ) {
    return this.wageBasisService.publishRuleSet(
      id,
      req.user,
      body?.confirmed === true,
    );
  }

  @Delete('rules/:id')
  @Roles(UserRole.SuperAdmin)
  removeRule(@Param('id') id: string) {
    return this.wageBasisService.removeRuleSet(id);
  }
}
