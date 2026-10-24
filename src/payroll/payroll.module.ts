import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Company, CompanySchema } from '../company/schemas/company.schema';
import { MailModule } from '../mail/mail.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { TaxTableService } from './tax-table.service';
import { PayrollRun, PayrollRunSchema } from './schemas/payroll-run.schema';
import { Shift, ShiftSchema } from '../shifts/schemas/shift.schema';
import {
  LeaveRequest,
  LeaveRequestSchema,
} from '../leave/schemas/leave-request.schema';
import {
  AgreementRuleSet,
  AgreementRuleSetSchema,
} from './schemas/agreement-rule-set.schema';
import {
  PayrollSettings,
  PayrollSettingsSchema,
} from './schemas/payroll-settings.schema';
import { WageRate, WageRateSchema } from './schemas/wage-rate.schema';
import {
  PayrollExport,
  PayrollExportSchema,
} from './schemas/payroll-export.schema';
import { RuleSource, RuleSourceSchema } from './schemas/rule-source.schema';
import {
  TaxTableYear,
  TaxTableYearSchema,
} from './schemas/tax-table-year.schema';
import { WageBasisController } from './wage-basis.controller';
import { WageBasisService } from './wage-basis.service';
import { WageRatesService } from './wage-rates.service';
import { RuleWatchService } from './rule-watch.service';
import { AgreementDraftService } from './agreement-draft.service';

@Module({
  imports: [
    MailModule,
    MongooseModule.forFeature([
      { name: PayrollRun.name, schema: PayrollRunSchema },
      { name: User.name, schema: UserSchema },
      { name: Company.name, schema: CompanySchema },
      { name: Shift.name, schema: ShiftSchema },
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
      { name: AgreementRuleSet.name, schema: AgreementRuleSetSchema },
      { name: PayrollSettings.name, schema: PayrollSettingsSchema },
      { name: WageRate.name, schema: WageRateSchema },
      { name: PayrollExport.name, schema: PayrollExportSchema },
      { name: RuleSource.name, schema: RuleSourceSchema },
      { name: TaxTableYear.name, schema: TaxTableYearSchema },
    ]),
  ],
  controllers: [PayrollController, WageBasisController],
  providers: [
    PayrollService,
    TaxTableService,
    WageBasisService,
    WageRatesService,
    RuleWatchService,
    AgreementDraftService,
  ],
  exports: [PayrollService],
})
export class PayrollModule {}
